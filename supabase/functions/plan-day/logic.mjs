/**
 * plan-day/logic.mjs, the pure (no I/O, no Deno APIs) half of the plan-day
 * Edge Function: request sanitizing, AI-output validation, the route
 * optimality check and the deterministic re-timing of the day.
 *
 * Kept as plain ESM JavaScript on purpose: Deno imports it directly from
 * index.ts, and the repo's Node test harness (continent-app/scripts/ai/)
 * imports the very same file, so what is tested is what ships.
 */

/* ---- text hygiene ---- */

// House style: no em/en dashes anywhere in user-facing copy. The model is
// told so, but sanitize regardless: digit ranges become hyphens, prose
// dashes become ", ". Control characters and stray whitespace go too.
export function cleanText(s, max = 240) {
  if (typeof s !== 'string') return '';
  return s
    .replace(new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g'), ' ')
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/\s*[–—•·]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/* ---- geometry ---- */

export function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---- request sanitizing ---- */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Whitelist + clamp the candidate list the client sent. Order is kept. */
export function sanitizeCandidates(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const c of raw.slice(0, 28)) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id ?? '').slice(0, 8);
    const lat = num(c.lat);
    const lon = num(c.lon);
    const name = cleanText(c.name, 90);
    if (!id || seen.has(id) || lat == null || lon == null || !name) continue;
    seen.add(id);
    out.push({
      id,
      name,
      kind: cleanText(c.kind, 30),
      cat: cleanText(c.cat, 10),
      lat,
      lon,
      rating: Math.max(0, Math.min(10, num(c.rating) ?? 5)),
      mustSee: !!c.mustSee,
      dwellMin: Math.max(5, Math.min(360, Math.round(num(c.dwellMin) ?? 40))),
      desc: cleanText(c.desc, 150),
    });
  }
  return out;
}

/**
 * Validate what the model returned against what we actually offered it.
 * Catalogue stops must reference a real candidate id (their coordinates and
 * name come from OUR data, never the model's memory); external discoveries
 * need finite coordinates within `maxKmFromCentre` of the city. Anything
 * else is dropped, and the caller learns how much was dropped.
 */
export function sanitizeAiStops(aiStops, candidates, centre, {
  maxStops = 10, maxExternal = 3, maxKmFromCentre = 60,
} = {}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const usedIds = new Set();
  const stops = [];
  let dropped = 0;
  let externals = 0;
  for (const s of Array.isArray(aiStops) ? aiStops : []) {
    if (stops.length >= maxStops) break;
    if (!s || typeof s !== 'object') { dropped += 1; continue; }
    const why = cleanText(s.why, 240);
    const dwellMin = Math.max(10, Math.min(360, Math.round(num(s.dwellMin) ?? 40)));
    const id = s.id != null ? String(s.id).slice(0, 8) : '';
    const cand = byId.get(id);
    if (cand) {
      if (usedIds.has(id)) { dropped += 1; continue; }
      usedIds.add(id);
      stops.push({
        id,
        name: cand.name,
        lat: cand.lat,
        lon: cand.lon,
        dwellMin,
        why,
        external: false,
      });
      continue;
    }
    // Not one of ours: only acceptable as an explicit discovery with sane,
    // in-area coordinates. The model inventing a "catalogue" stop is a drop.
    const lat = num(s.lat);
    const lon = num(s.lon);
    const name = cleanText(s.name, 90);
    const km = centre ? haversineKm(centre.lat, centre.lon, lat, lon) : null;
    const inArea = km != null && km <= maxKmFromCentre;
    if (s.inCatalog === false && name && inArea && externals < maxExternal) {
      externals += 1;
      stops.push({
        id: null,
        name,
        lat,
        lon,
        dwellMin,
        why,
        external: true,
        // Festivals, markets and one-off events: the model works from
        // training data with no live feed, so these are always presented as
        // "worth checking" rather than as confirmed opening times.
        isEvent: s.isEvent === true,
      });
    } else {
      dropped += 1;
    }
  }
  return { stops, dropped };
}

/* ---- route optimality check (the "is this actually a good walk?" pass) ---- */

function pathKm(order, pts, start) {
  let total = 0;
  let prev = start;
  for (const i of order) {
    if (prev) total += haversineKm(prev.lat, prev.lon, pts[i].lat, pts[i].lon) ?? 0;
    prev = pts[i];
  }
  return total;
}

/**
 * 2-opt improvement over an open path (start anchored at `start` when given,
 * e.g. the traveller's stay; the end is free). Stop counts here are tiny
 * (<= 10), so the classic O(n^2) sweep to convergence is instant.
 */
export function twoOptOrder(pts, start = null) {
  let order = pts.map((_, i) => i);
  if (pts.length < 3) return order;
  // Nearest-neighbour seed from the anchor gives 2-opt a sane starting point.
  if (start) {
    const remaining = new Set(order);
    const seeded = [];
    let cur = start;
    while (remaining.size) {
      let best = null;
      let bestD = Infinity;
      for (const i of remaining) {
        const d = haversineKm(cur.lat, cur.lon, pts[i].lat, pts[i].lon) ?? Infinity;
        if (d < bestD) { bestD = d; best = i; }
      }
      seeded.push(best);
      remaining.delete(best);
      cur = pts[best];
    }
    if (pathKm(seeded, pts, start) < pathKm(order, pts, start)) order = seeded;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < order.length - 1; a += 1) {
      for (let b = a + 1; b < order.length; b += 1) {
        const next = order.slice(0, a)
          .concat(order.slice(a, b + 1).reverse(), order.slice(b + 1));
        if (pathKm(next, pts, start) + 1e-9 < pathKm(order, pts, start)) {
          order = next;
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * The biggest group of stops that can honestly be walked in one day, chosen
 * out of an ordered list and KEEPING that order.
 *
 * Dropping outliers one by one is the wrong instrument when the whole deck is
 * spread: the candidate pool reaches 20 km from the city centre, so a model
 * that grazed across it produces a list where every leg is long, and a
 * per-leg filter would strip it down to a single stop. What a traveller
 * actually wants there is the best walkable CLUSTER.
 *
 * Each stop is tried as a seed; the others join it nearest-first for as long
 * as the resulting path (still in the given order, still anchored) keeps
 * every leg under `maxLegKm` and the total under `budgetKm`. The seed that
 * retains the most stops wins, shortest path breaking ties. Order is never
 * rearranged here: the model's chronology (indoor stops in the hot hours,
 * the viewpoint at sunset) survives the cut.
 *
 * Returns the surviving indices, in order.
 */
export function walkableSubset(order, pts, { start = null, maxLegKm, budgetKm }) {
  if (order.length <= 1) return [...order];
  const fits = (idxs) => {
    let total = 0;
    let prev = start;
    for (const i of idxs) {
      if (prev) {
        const km = haversineKm(prev.lat, prev.lon, pts[i].lat, pts[i].lon) ?? 0;
        if (km > maxLegKm) return null;
        total += km;
        if (total > budgetKm) return null;
      }
      prev = pts[i];
    }
    return total;
  };
  let best = null;
  let bestKm = Infinity;
  for (const seed of order) {
    const chosen = new Set([seed]);
    const others = order
      .filter((i) => i !== seed)
      .map((i) => ({ i, d: haversineKm(pts[seed].lat, pts[seed].lon, pts[i].lat, pts[i].lon) ?? Infinity }))
      .sort((a, b) => a.d - b.d);
    for (const { i } of others) {
      const trial = order.filter((j) => chosen.has(j) || j === i);
      if (fits(trial) != null) chosen.add(i);
    }
    const kept = order.filter((i) => chosen.has(i));
    const km = fits(kept);
    if (km == null) continue;
    if (!best || kept.length > best.length || (kept.length === best.length && km < bestKm)) {
      best = kept;
      bestKm = km;
    }
  }
  // Every seed failed its own first leg (a stay anchor further than maxLegKm
  // from everything). Keep the head of the order rather than nothing.
  return best || [order[0]];
}

/* ---- deterministic scheduling ---- */

/**
 * Minutes past midnight to a clock label. Deliberately does NOT wrap at 24h:
 * a day that runs to 35:32 has to LOOK wrong. Wrapping turned an impossible
 * plan into a pleasant-sounding "done around 11:32" and hid the 89 km walk
 * that produced it.
 */
const fmtHM = (min) => {
  const t = Math.max(0, Math.round(min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// What a person actually walks between sights across a sightseeing day. The
// traveller's own answer (profile.maxWalkKm) overrides this; it is the
// fallback for everyone who was never asked.
export const DEFAULT_MAX_WALK_KM = 12;
// One leg on foot between two sights, about 85 minutes' walking. Past this it
// is not a walk between sights, it is a transfer, and that stop belongs to
// another day. Set here so a genuine city outlier still survives (Brussels'
// Atomium sits 5.4 km out from the Grand Place and belongs in a Brussels day);
// the TOTAL budget, not this, is what makes a day possible or not. The app
// already flags any leg past an hour on foot, so a long one is never silent.
export const MAX_LEG_KM = 6.5;
// Beyond this the stay is not a walking origin. Mirrors STAY_WALK_MAX_KM in
// DayPlannerTab, which already draws that first hop as a ride, so the server
// must not bill it to the day's walking budget either.
export const STAY_WALK_MAX_KM = 2.5;

/**
 * The accuracy guarantee: whatever times the model dreamt up, the schedule
 * the traveller sees is recomputed here from real distances and honest dwell
 * times. The model's ORDER is kept unless a 2-opt pass beats it clearly
 * (>12% and >400 m shorter), in which case the day is reordered; either way
 * every arrival time is derived, never trusted.
 *
 * That guarantee used to cover only the clock. The candidate deck reaches 20
 * km out from the city centre, so a model that picked stops on opposite edges
 * of it produced a real, faithfully-timed, completely impossible day: 89 km
 * on foot, ending the following afternoon. Distance is now held to the same
 * standard as time. A stop whose incoming leg is a transfer rather than a
 * walk (MAX_LEG_KM), or that would push the day past its walking budget, is
 * dropped here rather than scheduled, and reported as `farDropped` so the
 * caller can say so. `maxWalkKm` is the traveller's own answer from the chat
 * profile, which until now was only ever REQUESTED of the model in the prompt
 * and never enforced.
 *
 * Groups walk slower than couples: sidewalk friction is real. A lunch break
 * lands after the first stop that ends past 12:30.
 */
export function scheduleDay(stops, {
  stay = null, groupSize = 2, dayStartMin = 9 * 60 + 30, lunchMin = 75,
  maxWalkKm = DEFAULT_MAX_WALK_KM, maxLegKm = null,
} = {}) {
  const pts = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  const rest = stops.filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon));
  const anchor = stay && Number.isFinite(stay.lat) && Number.isFinite(stay.lon) ? stay : null;

  let order = pts.map((_, i) => i);
  let optimized = false;
  if (pts.length >= 3) {
    const asIsKm = pathKm(order, pts, anchor);
    const better = twoOptOrder(pts, anchor);
    const betterKm = pathKm(better, pts, anchor);
    if (betterKm < asIsKm * 0.88 && asIsKm - betterKm > 0.4) {
      order = better;
      optimized = true;
    }
  }

  // A stay further out than a short stroll is not where the walking day
  // begins: the traveller rides in, and the app already draws that hop as a
  // ride. Anchoring the walk to it would bill the whole transfer to the day's
  // walking budget and blow it before the first sight.
  const stayGapKm = anchor
    ? Math.min(...order.map((i) => haversineKm(anchor.lat, anchor.lon, pts[i].lat, pts[i].lon) ?? Infinity))
    : Infinity;
  const startsAtStay = stayGapKm <= STAY_WALK_MAX_KM;
  const start = startsAtStay ? anchor : null;

  const budgetKm = Math.max(1, Number.isFinite(maxWalkKm) ? maxWalkKm : DEFAULT_MAX_WALK_KM);
  // No single hop may eat more than half the day's walking, and someone who
  // asked for a 25 km day is telling us they will happily walk further
  // between sights too, so the cap rises with their budget rather than
  // holding everyone to the city-stroll figure.
  const legCapKm = Number.isFinite(maxLegKm) ? maxLegKm : Math.max(MAX_LEG_KM, budgetKm / 2);
  const keep = walkableSubset(order, pts, { start, maxLegKm: legCapKm, budgetKm });
  const farDropped = order.length - keep.length;

  const speedKmh = groupSize >= 5 ? 3.8 : 4.5;
  let t = dayStartMin;
  let totalKm = 0;
  let lunchAfter = -1;
  let prev = start;
  const ordered = [];
  for (const i of keep) {
    const s = pts[i];
    const km = prev ? (haversineKm(prev.lat, prev.lon, s.lat, s.lon) ?? 0) : 0;
    const walkMin = Math.round((km / speedKmh) * 60);
    totalKm += km;
    t += walkMin;
    const arrive = t;
    t += s.dwellMin;
    if (lunchAfter < 0 && t >= 12 * 60 + 30) {
      lunchAfter = ordered.length;
      t += lunchMin;
    }
    prev = s;
    ordered.push({
      ...s,
      arrive: fmtHM(arrive),
      walkKmFromPrev: Math.round(km * 100) / 100,
      walkMinFromPrev: walkMin,
    });
  }

  return {
    stops: [...ordered, ...rest.map((s) => ({ ...s, arrive: null, walkKmFromPrev: 0, walkMinFromPrev: 0 }))],
    totalKm: Math.round(totalKm * 10) / 10,
    endTime: fmtHM(t),
    lunchAfter,
    lunchMin: lunchAfter >= 0 ? lunchMin : 0,
    optimized,
    farDropped,
    // False when the stay was too far to walk from, so the caller knows the
    // day's first leg is a ride it has not costed.
    fromStay: startsAtStay,
  };
}

/* ---- cache key ---- */

/**
 * Stable string over everything that changes the answer; hash it server-side.
 *
 * A refinement ("more museums, less walking") is part of the identity: the
 * same refinement over the same previous plan is deterministic and may be
 * served from cache, while a different one always earns a fresh generation.
 * The exact DATE matters for events, so events-mode requests key on the day
 * rather than only its month.
 */
/* ---- model fallback chain ---- */

// Every model on the free tier carries its OWN daily request budget, so a
// chain is not a redundancy trick, it multiplies the free ceiling: measured
// on this project's key, gemini-3.6-flash allows 20 requests a day while the
// lite models allow 500 each. Quality first, capacity last. Falling back is
// a real downgrade (the lite models do not reason before answering, so their
// sequencing is noticeably flatter), which is why they sit at the end rather
// than being used to stretch the budget from the start.
//
// Deliberately absent: the 2.5 family, which answers 404 "no longer
// available to new users" on keys created recently, and preview aliases,
// which move without notice.
export const DEFAULT_MODEL_CHAIN = [
  'gemini-flash-latest',   // 3.6 Flash today, the best of these at sequencing
  'gemini-3.5-flash',      // same class, its own separate daily budget
  'gemini-3.5-flash-lite', // no thinking, much larger budget
  'gemini-3.1-flash-lite', // last resort, same shape as the one above
];

/**
 * Resolve the ordered list of models to try.
 *
 * GEMINI_MODELS (comma separated) replaces the chain outright. Otherwise
 * GEMINI_MODEL, if set, is promoted to the front of the default chain and
 * de-duplicated, so pinning a model still leaves the fallbacks behind it
 * rather than silently giving up the extra capacity.
 */
export function modelChain(primary, list) {
  const parse = (s) => String(s || '').split(',').map((m) => m.trim()).filter(Boolean);
  const listed = parse(list);
  if (listed.length) return [...new Set(listed)].slice(0, 6);
  const pinned = parse(primary);
  return [...new Set([...pinned, ...DEFAULT_MODEL_CHAIN])].slice(0, 6);
}

/**
 * Should the chain advance to the next model after this HTTP status?
 *
 * 429 is the whole point (the daily or per-minute budget for THIS model is
 * spent). 404 covers a model retired out from under a pinned config, and 5xx
 * covers the "experiencing high demand" 503 that Google returns on popular
 * models. Anything else is our own bad request and would fail identically on
 * every model, so it stops the chain instead of burning the rest.
 */
export function shouldFallOver(status) {
  return status === 429 || status === 404 || status >= 500;
}

export function cacheKeyInput({
  model, destId, month, dateISO, groupSize, pace, vibe, avoidHills, freeText,
  lang, candidates, refine, prevStopIds, wantEvents, profile,
}) {
  const groupBand = groupSize >= 7 ? '7+' : groupSize >= 5 ? '5-6' : groupSize >= 3 ? '3-4' : String(groupSize);
  return JSON.stringify({
    // v3: the scheduler now enforces a walking budget and no longer wraps the
    // clock at midnight. Cached v2 payloads carry the old impossible totals
    // ("89.4 km on foot, done around 11:32"), so they must not be served.
    v: 3,
    model,
    destId,
    when: wantEvents ? (dateISO || '') : month,
    groupBand,
    pace,
    vibe,
    hills: !!avoidHills,
    free: cleanText(freeText, 280).toLowerCase(),
    events: !!wantEvents,
    // Two travellers who answered the chat differently must never share a
    // cached day, so the whole profile is part of the identity.
    profile: profile
      ? [profile.focus, profile.known, (profile.interests || []).join('+'),
        profile.maxWalkKm, profile.terrain, profile.dayLength, profile.food].join('|')
      : '',
    refine: cleanText(refine, 280).toLowerCase(),
    prev: Array.isArray(prevStopIds) ? prevStopIds.map((s) => String(s)) : [],
    lang,
    cands: candidates.map((c) => c.id).sort(),
  });
}
