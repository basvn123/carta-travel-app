/**
 * aiDayPlan.js, the client half of the AI day planner.
 *
 * Builds the candidate deck the Edge Function is allowed to sequence (always
 * from Carta's own catalogue, never the model's memory), invokes the
 * `plan-day` function through Supabase (so the AI key stays server-side),
 * and maps the validated response back into the day planner's own language:
 * assignment indices for catalogue stops, "discovery" extras for the rest.
 *
 * The AI is an enhancer, not a dependency: every failure path (guest, quota
 * spent, function missing, network down) resolves to a typed code the modal
 * turns into the deterministic built-in planner as a fallback.
 */
import { supabase } from '../lib/supabaseClient.js';
import {
  pickerDeck, dwellMinutes, poiRating, poiCategory, isMustSee, poiKind, poiMapCat,
} from './dayDraft.js';

/**
 * The whitelist of places the AI may schedule: the same quality-ranked deck
 * the map pins come from, minus what other days already claimed. `id` is the
 * ORIGINAL index into the city's items array, stringified, which is exactly
 * what the planner's assignments speak.
 */
export function buildAiCandidates({ items, walkable, excludeIdx, interests, limit = 22 }) {
  const eligible = excludeIdx && excludeIdx.size
    ? new Set([...(walkable || [])].filter((i) => !excludeIdx.has(i)))
    : walkable;
  return pickerDeck(items, interests || [], limit, eligible).map(({ item, idx }) => ({
    id: String(idx),
    name: item.name,
    kind: poiKind(item) || item.kind || '',
    cat: poiCategory(item),
    lat: item.lat,
    lon: item.lon,
    rating: poiRating(item).score,
    mustSee: isMustSee(item),
    dwellMin: dwellMinutes(poiKind(item) || item.kind),
    desc: (item.desc || '').slice(0, 150),
  }));
}

/**
 * Call the Edge Function. The payload carries the traveller's answers, the
 * optional chat `profile` (walking budget, terrain, interests and the rest)
 * and the candidate list; the key itself never leaves the server.
 *
 * Resolves to { ok: true, plan } or
 * { ok: false, code } where code is one of: no_auth_config, auth, user_cap,
 * global_cap, no_ai, too_few, ai_busy, ai_error, ai_timeout, ai_bad_output,
 * network.
 */
export async function requestAiDayPlan(payload) {
  if (!supabase) return { ok: false, code: 'no_auth_config' };
  try {
    const { data, error } = await supabase.functions.invoke('plan-day', { body: payload });
    if (error) {
      let code = 'ai_error';
      try {
        const body = await error.context?.json?.();
        if (body?.code) code = body.code;
      } catch { /* non-JSON error body */ }
      return { ok: false, code };
    }
    if (!data || !Array.isArray(data.stops) || !data.stops.length) {
      return { ok: false, code: 'ai_bad_output' };
    }
    return { ok: true, plan: data };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/**
 * Put the catalogue's own photo (and category) back on each proposed stop.
 *
 * The Edge Function is sent a deliberately thin candidate deck and answers
 * with names, coordinates and reasons: sending image URLs to a language model
 * would be paying tokens for something we already hold locally. So the picture
 * is rejoined here, on the way back, through the one link the two halves share:
 * `id` is the stop's ORIGINAL index into the city's items array.
 *
 * Bot finds live outside the catalogue and have no photo by definition; they
 * keep their glyph. Returns a new plan, the argument is untouched.
 */
export function decorateAiStops(plan, items) {
  if (!plan?.stops?.length) return plan;
  return {
    ...plan,
    stops: plan.stops.map((s) => {
      if (s.external) return s;
      const idx = Number(s.id);
      const item = Number.isInteger(idx) ? items?.[idx] : null;
      if (!item) return s;
      return {
        ...s,
        img: item.img || '',
        cat: poiMapCat(item),
        kind: poiKind(item) || item.kind || '',
        mustSee: isMustSee(item),
      };
    }),
  };
}

/**
 * Split a validated AI plan into what the existing planner machinery eats:
 * `orderedIdx` (original item indices, in the AI's optimized visit order,
 * becoming the day's assignments, numbered pins and OSRM walking route) and
 * `extras` (the flagged discoveries, rendered as their own map pins). A last
 * belt-and-braces pass keeps only indices that genuinely exist and carry
 * coordinates, so a malformed id can never crash the timeline.
 */
export function splitAiPlan(plan, items) {
  const orderedIdx = [];
  const extras = [];
  for (const s of plan?.stops || []) {
    if (s.external) {
      // Unmapped discoveries (the server could not place them) are kept too:
      // the traveller's own wish must never silently vanish. No coordinates
      // means no pin, only the listed line with its "custom location" note.
      if (s.name) {
        const mapped = Number.isFinite(s.lat) && Number.isFinite(s.lon);
        extras.push({
          name: s.name,
          lat: mapped ? s.lat : null,
          lon: mapped ? s.lon : null,
          arrive: s.arrive || null,
          dwellMin: s.dwellMin || 45,
          why: s.why || '',
          isEvent: !!s.isEvent,
          unmapped: !mapped,
        });
      }
      continue;
    }
    const idx = Number(s.id);
    const item = Number.isInteger(idx) ? items?.[idx] : null;
    if (item && item.lat != null && item.lon != null && !orderedIdx.includes(idx)) {
      orderedIdx.push(idx);
    }
  }
  return { orderedIdx, extras };
}
