/**
 * parkingTruth.js: the parking facts a place page may show (T1030).
 *
 * The owner's rule: parking data must be valid, or it does not show. A fact
 * check (Execution/P15/T1029-T1030-rating-before-you-go.md) found the raw
 * dossier block wrong in predictable ways, so this keeps only what held up:
 *
 *   restricted   the web check's zone flag, when it says there is one. Its
 *                "no zone" is not shown: Hallstatt's was wrong.
 *   rides        park-and-ride sites the check names, then the OSM one when
 *                it has a name and lies 3 km or more out (a "P+R" in the
 *                centre, Rome's Trastevere, is a station car park).
 *   named        car parks the check names, minus park-and-rides filed
 *                there, bare street names and coach parking. Their price
 *                notes are dropped: stale, and some were season tickets.
 *   spots        OSM car parks with a name, 50 spaces or more, not a street
 *                bay; inside a restricted zone only garages (underground,
 *                multi-storey), since a surface lot there is behind a gate.
 *                The distance is the straight line from the centre point;
 *                the old walk minutes were a guess on top of it.
 *
 * Returns null when nothing survives.
 */

import { cleanName, safeUrl } from './format.js';

const RIDE = /\bp\s*\+\s*r\b|scambio|park\s*(?:and|&|\+|'?n'?)\s*ride|relais/i;
const STREET = /^(?:via|viale|corso|rue|avenue|calle|carrer|stra(?:ss|ß)e|street|road)\b/i;
const COACH = /\b(?:bus|coach|reisebus|autocar)\b/i;
const GARAGE = new Set(['underground', 'multi-storey', 'multistorey', 'rooftop']);
const RIDE_MIN_M = 3000;
const SPOT_MIN_CAP = 50;

/** "ANAGNINA" reads as "Anagnina"; mixed case stays as written. */
function tidy(name) {
  const n = cleanName(String(name || '')).trim();
  if (!n || n !== n.toUpperCase() || !/[A-Z]/.test(n)) return n;
  return n.toLowerCase().replace(/(^|[\s'(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

export function parkingTruth(parking) {
  if (!parking) return null;
  const web = parking.web || null;
  const restricted = web?.restricted === true;

  const rides = [];
  const seen = new Set();
  const addRide = (name, extra = {}) => {
    const n = tidy(name);
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    rides.push({ name: n, ...extra });
  };
  (web?.park_ride_names || []).forEach((n) => addRide(n));
  const osmRide = parking.park_ride;
  if (osmRide?.name && Number(osmRide.dist_m) >= RIDE_MIN_M) addRide(osmRide.name, { nav: osmRide.nav, dist_m: osmRide.dist_m });

  const named = [];
  for (const c of web?.car_parks || []) {
    const n = tidy(c?.name);
    if (!n || RIDE.test(n) || STREET.test(n) || COACH.test(c?.note || '') || COACH.test(n) || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    named.push({ name: n });
  }

  const spots = (parking.spots || []).filter((s) => s?.name
    && s.type !== 'street_side' && s.type !== 'lane'
    && Number(s.capacity) >= SPOT_MIN_CAP
    && (!restricted || GARAGE.has(s.type))
    && !seen.has(tidy(s.name).toLowerCase()))
    .map((s) => ({ ...s, name: tidy(s.name) }));

  const url = safeUrl(web?.official_url);
  if (!restricted && !rides.length && !named.length && !spots.length) return null;
  return { restricted, checked: web?.checked || null, url, rides, named, spots };
}
