/**
 * How the traveller likes to travel (owner, plan flow walk 2026-10-30): the
 * persona. Some stay in the big cities and hop between them; some stay just
 * outside the hubs (Antibes, not Nice) and see the region from there; some
 * want small towns, nature, places few tourists find, or nights out.
 *
 * Each place gets a persona fit P in 0..1 from its own features, every one
 * in 0..1 too:
 *
 *   big       its size class (metro to area), config persona.size.big
 *   townish   how much it is a town or village, persona.size.townish
 *   notMetro  1 unless it is a metro
 *   hubNear   a metro close by: 1 within hubKm[0], 0 past hubKm[1]
 *   around    good places within aroundKm (rated aroundMin and up), full
 *             at aroundCap: what there is to see on day trips from it
 *   nature    the strongest of its hiking, lakes and ski values
 *   hidden    its hidden value, a catalogue hidden gem, or tagged quiet
 *   quiet     1 - its crowd tier in the month / 3
 *   nightlife its nightlife value
 *   culture   the stronger of its culture and city values
 *   base      how good a base it is (place.base)
 *
 *   P = sum(w_f x f) / sum(w_f), the weights per persona in config
 *       recommend.json persona.profiles ("mix" has none: no persona term)
 *
 * The trip finder adds weight x (P - 0.5) to a place's pool key
 * (candidates.js) and to a trip's score (rank.js); the rating, the personal
 * match (lib/match.js) and Explore never read it. Pure and node-runnable.
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { haversineKm } from '../runtime_pricing.js';
import { qualityOf } from '../match.js';

export const PERSONA = Object.freeze(RECOMMEND.persona);
export const PERSONAS = Object.freeze([...PERSONA.ids]);

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num = (v) => (Number.isFinite(Number(v)) && v != null ? Number(v) : null);
const like = (d, k) => {
  const v = d?.taste?.likes?.[k];
  return Array.isArray(v) ? num(v[0]) : null;
};
const classOf = (d) => d?.place?.class || d?.taste?.size || null;

/** True when `p` is a persona that weighs places ("mix" and none do not). */
export const weighs = (p) => Boolean(p && PERSONA.profiles[p]);

/**
 * Where each place stands among the others: the nearest metro (its id and
 * km) and how many good places lie around it. Built once per catalogue
 * (a WeakMap on the destinations object), on a one-degree grid so each
 * place looks only at its neighbours.
 */
const INDEXES = new WeakMap();
const CELL = 1;
const cellOf = (lat, lon) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
export function placeIndex(destinations) {
  if (!destinations || typeof destinations !== 'object') return new Map();
  const cached = INDEXES.get(destinations);
  if (cached) return cached;
  const rows = Object.entries(destinations).filter(([, d]) => d && Number.isFinite(d.lat) && Number.isFinite(d.lon) && !d.gateway_of);
  const grid = new Map();
  for (const [id, d] of rows) {
    const key = cellOf(d.lat, d.lon);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push([id, d]);
  }
  const reach = Math.max(PERSONA.hubKm[1], PERSONA.aroundKm);
  const span = Math.ceil(reach / 70) + 1; // a degree is at least ~70 km of longitude in Europe
  const out = new Map();
  for (const [id, d] of rows) {
    const la = Math.floor(d.lat / CELL);
    const lo = Math.floor(d.lon / CELL);
    let hub = null;
    let around = 0;
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        for (const [oid, o] of grid.get(`${la + i}:${lo + j}`) || []) {
          if (oid === id) continue;
          const km = haversineKm(d.lat, d.lon, o.lat, o.lon);
          if (km == null || km > reach) continue;
          if (classOf(o) === 'metro' && (!hub || km < hub.km)) hub = { id: oid, km };
          if (km <= PERSONA.aroundKm && (o.rating?.score || 0) >= PERSONA.aroundMin) around += 1;
        }
      }
    }
    out.set(id, { hub, around });
  }
  INDEXES.set(destinations, out);
  return out;
}

/** The persona features of one place (each 0..1; see the module note). */
export function personaFeatures(id, d, destinations, month = null) {
  const at = placeIndex(destinations).get(id) || { hub: null, around: 0 };
  const cls = classOf(d);
  const [near, far] = PERSONA.hubKm;
  const hubKm = at.hub?.km ?? null;
  const crowd = (() => {
    const c = d?.taste?.crowd_by_month;
    if (!Array.isArray(c) || c.length !== 12) return null;
    const m = Number(month);
    if (m >= 1 && m <= 12) return num(c[m - 1]);
    const vals = c.map(num).filter((v) => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  })();
  const nature = Math.max(like(d, 'hiking') ?? 0, like(d, 'lakes') ?? 0, like(d, 'ski') ?? 0);
  const hidden = Math.max(like(d, 'hidden') ?? 0, d?.rating?.hidden_gem === true ? 1 : 0, (d?.categories || []).includes('quiet') ? 0.6 : 0);
  return {
    big: PERSONA.size.big[cls] ?? 0.3,
    townish: PERSONA.size.townish[cls] ?? 0.5,
    notMetro: cls === 'metro' ? 0 : 1,
    hubNear: hubKm == null ? 0 : clamp01((far - hubKm) / (far - near)),
    around: clamp01(at.around / PERSONA.aroundCap),
    nature,
    hidden,
    quiet: crowd == null ? 0.5 : clamp01(1 - crowd / 3),
    nightlife: like(d, 'nightlife') ?? 0.3,
    culture: Math.max(like(d, 'culture') ?? 0, like(d, 'city') ?? 0),
    base: num(d?.place?.base) ?? 0.5,
    // Facts for the trip card's reason.
    hub: at.hub ? { id: at.hub.id, km: Math.round(at.hub.km), city: destinations?.[at.hub.id]?.city || null } : null,
    aroundN: at.around,
  };
}

/** The persona fit P (0..1) of one place, or null for "mix" and none. */
export function personaFit(persona, id, destinations, month = null) {
  if (!weighs(persona)) return null;
  const d = destinations?.[id];
  if (!d) return null;
  const f = personaFeatures(id, d, destinations, month);
  const w = PERSONA.profiles[persona];
  let s = 0;
  let n = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (!Number.isFinite(f[k])) continue;
    s += wk * f[k];
    n += wk;
  }
  return n ? s / n : null;
}

/** The persona's move on a key: weight x (P - 0.5), 0 without a persona fit. */
export const personaShift = (p) => (p == null ? 0 : PERSONA.weight * (p - 0.5));

/**
 * A country's place pool for a persona: its rated places (minScore and up,
 * with a photograph, not a gateway), ordered by the key the caller gives
 * (quality, or forYou with the taste) plus the persona's shift; the first
 * config pool ids. Wider than the country match's own pool, so a small
 * place near a hub (Antibes, Saint-Paul-de-Vence) can lead.
 */
export function personaPool(persona, iso2, destinations, { month = null, keyOf = null } = {}) {
  const up = String(iso2 || '').toUpperCase();
  const base = (d) => (keyOf ? keyOf(d) : null) ?? qualityOf(d, month) ?? 0;
  return Object.entries(destinations || {})
    .filter(([, d]) => d && String(d.iso2 || '').toUpperCase() === up && Number.isFinite(d.lat) && !d.gateway_of
      && d.image?.url && (d.rating?.score || 0) >= PERSONA.minScore)
    .map(([id, d]) => ({ id, k: base(d) + personaShift(personaFit(persona, id, destinations, month)) }))
    .sort((a, b) => b.k - a.k || a.id.localeCompare(b.id))
    .slice(0, PERSONA.pool)
    .map((x) => x.id);
}

/** A trip's persona fit: its places' P, weighed by their nights; null without one. */
export function tripPersona(trip, persona, destinations) {
  if (!weighs(persona)) return null;
  let s = 0;
  let n = 0;
  for (const p of trip.places || []) {
    const v = personaFit(persona, p.id, destinations, trip.month);
    if (v == null) continue;
    s += v * (p.nights || 1);
    n += p.nights || 1;
  }
  return n ? s / n : null;
}

/**
 * The trip card's persona reason, or null when the trip does not fit its
 * persona well enough (config reasonMin) to say so. The facts are the
 * traveller's: the base, the hub and how far, the places.
 */
export function personaReason(trip, persona, destinations) {
  const p = tripPersona(trip, persona, destinations);
  if (p == null || p < PERSONA.reasonMin) return null;
  const first = trip.places?.[0]?.id;
  const d = destinations?.[first];
  if (!d) return null;
  const f = personaFeatures(first, d, destinations, trip.month);
  const rows = (trip.places || []).map((x) => destinations?.[x.id]).filter(Boolean);
  const places = rows.map((x) => x.city).filter(Boolean);
  const classes = rows.map(classOf);
  const key = `tf.reason.persona.${persona}`;
  // Each reason says only what is true of the trip: big cities only when
  // every place is a metro or a city, a calmer base only beside a metro.
  const R = PERSONA.reasonFacts;
  switch (persona) {
    case 'outside':
      return f.hub?.city && f.notMetro ? { key, facts: { place: d.city, hub: f.hub.city, km: f.hub.km } } : null;
    case 'hubtrips':
      return (classes[0] === 'metro' || classes[0] === 'city') && f.aroundN >= R.aroundN
        ? { key, facts: { place: d.city, n: f.aroundN, km: PERSONA.aroundKm } } : null;
    case 'cities':
      return classes.every((c) => c === 'metro' || c === 'city') ? { key, facts: { places } } : null;
    case 'towns':
      // "Close together" needs two places at least.
      return places.length > 1 && classes.every((c) => c === 'town' || c === 'village' || c === 'area') ? { key, facts: { places } } : null;
    case 'nature':
      return f.nature >= R.nature ? { key, facts: { place: d.city } } : null;
    case 'hidden':
      return f.hidden >= R.hidden || f.quiet >= R.quiet ? { key, facts: { place: d.city } } : null;
    case 'lively':
      return f.nightlife >= R.nightlife ? { key, facts: { place: d.city } } : null;
    default:
      return null;
  }
}

/** The shapes a persona builds when What kind of trip has no answer, or null. */
export const personaShapes = (persona) => (weighs(persona) ? PERSONA.shapes[persona] || null : null);

/** A persona's own reach between a trip's places ({ maxKm, minKm }), or null. */
export const personaReach = (persona) => PERSONA.towns?.[persona] || null;
