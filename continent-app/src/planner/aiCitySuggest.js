/**
 * aiCitySuggest.js, the client half of the Carta bot's "ask AI" town search.
 *
 * Same shape as aiDayPlan.js: build a whitelisted candidate list from Carta's
 * own catalogue (never trust the model's memory for coordinates), invoke the
 * `suggest-city` Edge Function through Supabase (the AI key stays server
 * side), and hand back a typed result the UI can render directly. Unlike the
 * day-inside-a-city planner, this endpoint is also allowed to surface real
 * places the catalogue doesn't have (Google Search grounding), flagged as
 * such so the caller can snap them to the nearest destination it has data for.
 */
import { supabase } from '../lib/supabaseClient.js';

/**
 * The whitelist of towns the AI may rank or reference: real destinations
 * within reach of the stay point, each carrying just enough to judge fit.
 */
export function buildCityCandidates(towns, { limit = 120 } = {}) {
  return (towns || []).slice(0, limit)
    .filter((tn) => tn?.dest?.city)
    .map((tn) => {
      const d = tn.dest;
      const tags = [];
      if (d.nature) tags.push('nature');
      if (d.bathing_water) tags.push('beach');
      if (d.rating?.hidden_gem) tags.push('hidden_gem');
      if (d.crowding?.label) tags.push(String(d.crowding.label).toLowerCase());
      return {
        id: tn.id,
        name: d.city,
        country: d.country,
        km: Math.round(tn.km),
        rating: d.rating?.score ?? null,
        tags,
      };
    });
}

/**
 * Call the Edge Function. Resolves to { ok: true, suggestions } or
 * { ok: false, code } where code is one of: no_auth_config, auth, user_cap,
 * global_cap, no_ai, too_few, ai_busy, ai_error, ai_timeout, ai_bad_output,
 * network.
 */
export async function requestCitySuggestion(payload) {
  if (!supabase) return { ok: false, code: 'no_auth_config' };
  try {
    const { data, error } = await supabase.functions.invoke('suggest-city', { body: payload });
    if (error) {
      let code = 'ai_error';
      try {
        const body = await error.context?.json?.();
        // Only our own string codes: the gateway's {code:"NOT_FOUND"} for an
        // undeployed function must map to "not switched on", not "hiccup".
        if (typeof body?.code === 'string') code = body.code;
      } catch { /* non-JSON error body */ }
      if (code === 'NOT_FOUND' || error.context?.status === 404) code = 'no_ai';
      return { ok: false, code };
    }
    if (!data || !Array.isArray(data.suggestions)) {
      return { ok: false, code: 'ai_bad_output' };
    }
    return { ok: true, suggestions: data.suggestions };
  } catch {
    return { ok: false, code: 'network' };
  }
}
