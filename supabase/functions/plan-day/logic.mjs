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

/* ---- deterministic scheduling ---- */

const fmtHM = (min) => {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * The accuracy guarantee: whatever times the model dreamt up, the schedule
 * the traveller sees is recomputed here from real distances and honest dwell
 * times. The model's ORDER is kept unless a 2-opt pass beats it clearly
 * (>12% and >400 m shorter), in which case the day is reordered; either way
 * every arrival time is derived, never trusted.
 *
 * Groups walk slower than couples: sidewalk friction is real. A lunch break
 * lands after the first stop that ends past 12:30.
 */
export function scheduleDay(stops, {
  stay = null, groupSize = 2, dayStartMin = 9 * 60 + 30, lunchMin = 75,
} = {}) {
  const pts = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  const rest = stops.filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon));
  const start = stay && Number.isFinite(stay.lat) && Number.isFinite(stay.lon) ? stay : null;

  let order = pts.map((_, i) => i);
  let optimized = false;
  if (pts.length >= 3) {
    const asIsKm = pathKm(order, pts, start);
    const better = twoOptOrder(pts, start);
    const betterKm = pathKm(better, pts, start);
    if (betterKm < asIsKm * 0.88 && asIsKm - betterKm > 0.4) {
      order = better;
      optimized = true;
    }
  }

  const speedKmh = groupSize >= 5 ? 3.8 : 4.5;
  let t = dayStartMin;
  let totalKm = 0;
  let lunchAfter = -1;
  let prev = start;
  const ordered = order.map((i, pos) => {
    const s = pts[i];
    const km = prev ? (haversineKm(prev.lat, prev.lon, s.lat, s.lon) ?? 0) : 0;
    const walkMin = Math.round((km / speedKmh) * 60);
    totalKm += km;
    t += walkMin;
    const arrive = t;
    t += s.dwellMin;
    if (lunchAfter < 0 && t >= 12 * 60 + 30) {
      lunchAfter = pos;
      t += lunchMin;
    }
    prev = s;
    return {
      ...s,
      arrive: fmtHM(arrive),
      walkKmFromPrev: Math.round(km * 100) / 100,
      walkMinFromPrev: walkMin,
    };
  });

  return {
    stops: [...ordered, ...rest.map((s) => ({ ...s, arrive: null, walkKmFromPrev: 0, walkMinFromPrev: 0 }))],
    totalKm: Math.round(totalKm * 10) / 10,
    endTime: fmtHM(t),
    lunchAfter,
    lunchMin: lunchAfter >= 0 ? lunchMin : 0,
    optimized,
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
export function cacheKeyInput({
  model, destId, month, dateISO, groupSize, pace, vibe, avoidHills, freeText,
  lang, candidates, refine, prevStopIds, wantEvents, profile,
}) {
  const groupBand = groupSize >= 7 ? '7+' : groupSize >= 5 ? '5-6' : groupSize >= 3 ? '3-4' : String(groupSize);
  return JSON.stringify({
    v: 2,
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
