/**
 * suggest-city/logic.mjs, the pure (no I/O, no Deno APIs) half of the
 * suggest-city Edge Function: request sanitizing and AI-output validation.
 *
 * Kept as plain ESM JavaScript on purpose, same reasoning as plan-day's own
 * logic.mjs: Deno imports it directly from index.ts, and it is importable
 * from a Node test harness with no key or network needed. The two tiny
 * geometry/text helpers are shared with plan-day rather than duplicated.
 */
import { cleanText, haversineKm } from '../plan-day/logic.mjs';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Whitelist + clamp the town candidate list the client sent. Order is kept. */
export function sanitizeTownCandidates(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const c of raw.slice(0, 150)) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id ?? '').slice(0, 40);
    const name = cleanText(c.name, 90);
    if (!id || seen.has(id) || !name) continue;
    seen.add(id);
    out.push({
      id,
      name,
      country: cleanText(c.country, 60),
      km: Math.max(0, Math.round(num(c.km) ?? 0)),
      rating: num(c.rating),
      tags: Array.isArray(c.tags) ? c.tags.slice(0, 6).map((t) => cleanText(t, 20)).filter(Boolean) : [],
    });
  }
  return out;
}

/**
 * Validate what the model returned against what we actually offered it.
 * inCatalog suggestions must reference a real candidate id (name/country
 * come from OUR data); inCatalog=false discoveries need finite coordinates
 * within `maxKmFromStay` of the traveller's stay (when a stay was given) and
 * a name. Anything else is dropped.
 */
export function sanitizeSuggestions(raw, candidates, stay, {
  maxSuggestions = 5, maxKmFromStay = 400,
} = {}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const usedIds = new Set();
  const out = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (out.length >= maxSuggestions) break;
    if (!s || typeof s !== 'object') continue;
    const why = cleanText(s.why, 200);
    const id = s.id != null ? String(s.id).slice(0, 40) : '';
    const cand = byId.get(id);
    if (cand) {
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      out.push({
        id, name: cand.name, country: cand.country, why, inCatalog: true,
      });
      continue;
    }
    const lat = num(s.lat);
    const lon = num(s.lon);
    const name = cleanText(s.name, 90);
    const km = stay && lat != null && lon != null ? haversineKm(stay.lat, stay.lon, lat, lon) : null;
    const inArea = !stay || (km != null && km <= maxKmFromStay);
    if (s.inCatalog === false && name && lat != null && lon != null && inArea) {
      out.push({
        id: null, name, country: cleanText(s.country, 60), why, inCatalog: false, lat, lon,
      });
    }
  }
  return out;
}

/** Stable string over everything that changes the answer; hash it server-side. */
export function cacheKeyInput({
  model, stay, focus, interests, freeText, lang, candidates, grounded,
}) {
  return JSON.stringify({
    v: 1,
    model,
    // Rounded to ~1km: near-identical stay points should share a cache entry.
    stay: stay ? [Math.round(stay.lat * 100) / 100, Math.round(stay.lon * 100) / 100] : null,
    focus: focus || '',
    interests: (interests || []).slice().sort(),
    free: cleanText(freeText, 160).toLowerCase(),
    lang,
    grounded: !!grounded,
    cands: candidates.map((c) => c.id).sort(),
  });
}
