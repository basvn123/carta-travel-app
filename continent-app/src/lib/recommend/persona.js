/**
 * How the traveller likes to travel (owner, plan flow walk 2026-10-30): the
 * persona. Some stay in the big cities and hop between them; some stay just
 * outside the hubs (Antibes, not Nice) and see the region from there; some
 * want small towns, the sea, nature, places few tourists find, one base
 * for the week, or nights out.
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
 *   coast     the stronger of its beach and islands values, or tagged coast
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
 * T891 (owner, plan flow studio 2026-10-30): a traveller picks up to three
 * personas, one maybe marked "most you". A place's P is then the best of
 * the picks, each weighed (1 for the one most you, or for every pick when
 * none is marked; config persona.otherW for the rest), so a lake town
 * scores for someone who picked a big city and the lakes, and a trip's P
 * (its places by nights) rewards a mix. Every function here takes one id
 * (as before), a list of ids, or { ids, most } (personaOf(guide)).
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

/**
 * The picks of a persona answer, each { id, w }: one id, a list of ids or
 * { ids, most }, the "most you" first. "mix" and unknown ids weigh nothing
 * and drop out.
 */
export function picksOf(spec) {
  const ids = typeof spec === 'string' ? [spec] : Array.isArray(spec) ? spec : Array.isArray(spec?.ids) ? spec.ids : [];
  const most = spec && typeof spec === 'object' && !Array.isArray(spec) && ids.includes(spec.most) ? spec.most : null;
  const other = PERSONA.otherW ?? 0.85;
  const out = [...new Set(ids)].filter((p) => p && PERSONA.profiles[p])
    .map((id) => ({ id, w: !most || id === most ? 1 : other }));
  return most ? [...out.filter((x) => x.id === most), ...out.filter((x) => x.id !== most)] : out;
}

/** The persona answer of a trip's guide settings: { ids, most } (T891), from
 *  guide.personas and guide.personaMost, or the one guide.persona of a trip
 *  saved before. */
export function personaOf(guide) {
  const ids = Array.isArray(guide?.personas) && guide.personas.length ? guide.personas : (guide?.persona ? [guide.persona] : []);
  return { ids, most: ids.includes(guide?.personaMost) ? guide.personaMost : null };
}

/** True when the answer holds a persona that weighs places ("mix" and none do not). */
export const weighs = (p) => picksOf(p).length > 0;

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
  const coast = Math.max(like(d, 'beach') ?? 0, like(d, 'islands') ?? 0, (d?.categories || []).includes('coast') ? 0.8 : 0);
  const hidden = Math.max(like(d, 'hidden') ?? 0, d?.rating?.hidden_gem === true ? 1 : 0, (d?.categories || []).includes('quiet') ? 0.6 : 0);
  return {
    big: PERSONA.size.big[cls] ?? 0.3,
    townish: PERSONA.size.townish[cls] ?? 0.5,
    notMetro: cls === 'metro' ? 0 : 1,
    hubNear: hubKm == null ? 0 : clamp01((far - hubKm) / (far - near)),
    around: clamp01(at.around / PERSONA.aroundCap),
    coast,
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

/** One persona's fit of a place's features, or null. */
function fitOne(persona, f) {
  let s = 0;
  let n = 0;
  for (const [k, wk] of Object.entries(PERSONA.profiles[persona])) {
    if (!Number.isFinite(f[k])) continue;
    s += wk * f[k];
    n += wk;
  }
  return n ? s / n : null;
}

/**
 * The persona fit P (0..1) of one place, or null for "mix" and none: the
 * best of the picks, each times its weight (T891); one id reads as before.
 */
export function personaFit(persona, id, destinations, month = null) {
  const picks = picksOf(persona);
  if (!picks.length) return null;
  const d = destinations?.[id];
  if (!d) return null;
  const f = personaFeatures(id, d, destinations, month);
  let best = null;
  for (const { id: p, w } of picks) {
    const v = fitOne(p, f);
    if (v != null && (best == null || w * v > best)) best = w * v;
  }
  return best;
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
  // T891: several picks speak through the one the trip fits best that has
  // something true to say.
  const picks = picksOf(persona);
  if (picks.length > 1) {
    const order = picks
      .map((x) => ({ id: x.id, p: tripPersona(trip, x.id, destinations) ?? 0 }))
      .sort((a, b) => b.p - a.p);
    for (const x of order) {
      const r = personaReason(trip, x.id, destinations);
      if (r) return r;
    }
    return null;
  }
  persona = picks[0].id;
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
    case 'coast':
      return f.coast >= R.coast ? { key, facts: { place: d.city } } : null;
    case 'nature':
      return f.nature >= R.nature ? { key, facts: { place: d.city } } : null;
    case 'slow':
      return rows.length === 1 && f.base >= R.base ? { key, facts: { place: d.city } } : null;
    case 'hidden':
      return f.hidden >= R.hidden || f.quiet >= R.quiet ? { key, facts: { place: d.city } } : null;
    case 'lively':
      return f.nightlife >= R.nightlife ? { key, facts: { place: d.city } } : null;
    default:
      return null;
  }
}

/** The shapes the picks build when What kind of trip has no answer (their
 *  union, the most you first), or null. */
export function personaShapes(persona) {
  const out = [...new Set(picksOf(persona).flatMap((x) => PERSONA.shapes[x.id] || []))];
  return out.length ? out : null;
}

/** The picks' own reach between a trip's places ({ maxKm, minKm }), or null:
 *  the first pick that has one. */
export function personaReach(persona) {
  const hit = picksOf(persona).find((x) => PERSONA.towns?.[x.id]);
  return hit ? PERSONA.towns[hit.id] : null;
}

/**
 * The places that fit the picks (T891), for the plan flow's side panel: the
 * rated places with a photograph (persona minScore and up, no gateway) whose
 * P reaches config persona.reasonMin, best first. `count` is how many there
 * are, `top` the first n.
 */
export function personaMatches(persona, destinations, { month = null, n = 3 } = {}) {
  if (!weighs(persona)) return null;
  const rows = [];
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d || !Number.isFinite(d.lat) || d.gateway_of || !d.image?.url || (d.rating?.score || 0) < PERSONA.minScore) continue;
    const p = personaFit(persona, id, destinations, month);
    if (p != null && p >= PERSONA.reasonMin) rows.push({ id, p });
  }
  rows.sort((a, b) => b.p - a.p || (destinations[b.id].rating?.score || 0) - (destinations[a.id].rating?.score || 0) || a.id.localeCompare(b.id));
  return { count: rows.length, top: rows.slice(0, n) };
}

/**
 * One photograph for each persona (T892), from the catalogue: the
 * best-known place among those that fit that persona best (the rated
 * places, photo, no gateway), never one photo twice, so the card shows a
 * real place of that kind with its Commons credit. "mix" takes the best
 * known place left. { [persona]: { url, city, iso2, id } }.
 */
export function personaPhotos(destinations, ids = PERSONAS) {
  const rows = Object.entries(destinations || {})
    .filter(([, d]) => d?.image?.url && d.city && Number.isFinite(d.lat) && !d.gateway_of && (d.rating?.score || 0) >= 7.5);
  const used = new Set();
  const out = {};
  const fame = (d) => d.rating?.fame || 0;
  for (const p of ids.filter((x) => PERSONA.profiles[x])) {
    const fits = rows.map(([id, d]) => ({ id, d, v: personaFit(p, id, destinations) ?? 0 }))
      .sort((a, b) => b.v - a.v);
    // Among the 24 best fits, the best known one not shown yet.
    const hit = fits.slice(0, 24).filter((x) => !used.has(x.d.image.url)).sort((a, b) => fame(b.d) - fame(a.d))[0];
    if (!hit) continue;
    used.add(hit.d.image.url);
    out[p] = { url: hit.d.image.url, city: hit.d.city, iso2: hit.d.iso2 || null, id: hit.id };
  }
  for (const p of ids.filter((x) => !PERSONA.profiles[x])) {
    const hit = [...rows].sort((a, b) => fame(b[1]) - fame(a[1])).find(([, d]) => !used.has(d.image.url));
    if (!hit) continue;
    used.add(hit[1].image.url);
    out[p] = { url: hit[1].image.url, city: hit[1].city, iso2: hit[1].iso2 || null, id: hit[0] };
  }
  return out;
}
