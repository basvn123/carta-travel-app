/**
 * suggest-city, the Carta bot's "ask AI where to go" Edge Function.
 *
 * The client sends the traveller's stay point, mood (focus/interests) and a
 * free-text wish, plus a candidate list of real destinations drawn from
 * Carta's own catalogue within reach. Unlike plan-day, this endpoint is
 * explicitly allowed to look beyond that list: Google Search grounding is on
 * by default, since the whole point of "ask AI" is surfacing a real place
 * Carta hasn't researched yet. Every returned suggestion is still
 * re-validated server-side in logic.mjs: a catalogue pick must reference a
 * real candidate id, a web discovery needs real, in-area coordinates.
 *
 * Shares its quota ledger and cache with plan-day (`ai_consume`,
 * `ai_plan_cache`, migrations 006 and 007) - both tables are already generic
 * ("one AI generation" / hash-to-payload), so no new migration is needed for
 * this function.
 *
 * Billing posture: identical to plan-day (see its header). The short version
 * is that the old unbilled-key guarantee is GONE, because Google's Gemini API
 * Additional Terms (2026-03-23) require Paid Services for any API client
 * serving users in the EEA, Switzerland or the UK, which is Carta's whole
 * market. Grounding matters more here than anywhere else: this endpoint is
 * grounded by default and Gemini 3 bills per search query the model runs, so
 * grounded suggestions are a PAID-tier feature and spend the 'ground'
 * allowance. Free users still get an answer, drawn from Carta's own catalogue
 * rather than live search. See README.md for the deploy steps.
 *
 * Secrets (set via `supabase secrets set`): GEMINI_API_KEY, and optionally
 * GEMINI_MODEL (default gemini-flash-latest), AI_GLOBAL_DAILY_CAP (200),
 * AI_ENABLE_CITY_GROUNDING (default true). Per-user caps come from
 * public.plan_tiers, not from env. Provider and chain (T1137):
 * AI_SUGGEST_CITY_PROVIDER, AI_SUGGEST_CITY_MODELS and the other keys in
 * supabase/functions/_shared/aiModels.mjs.
 *
 * AI security and model access (T1137, E3, closing T1117-c): the wish and the
 * candidate deck are scrubbed by aiGuard before the cache key and the prompt,
 * the guard's rules ride in the system slot, the answer is shape-checked and
 * its text repaired, and a cached payload passes the same check before it is
 * served. The call itself goes through aiModels.callModel.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanText } from '../plan-day/logic.mjs';
import {
  LIMITS, guardCityInput, guardCityOutput, guardCityPayload, makeNonce, systemRules,
} from '../_shared/aiGuard.mjs';
import {
  modelAccess, callModel, chainKey, supportsSearch, parseModelJson, refusalBody,
} from '../_shared/aiModels.mjs';
import { sanitizeTownCandidates, sanitizeSuggestions, cacheKeyInput } from './logic.mjs';
// The prompt and the response schema, from the prompt registry (T1140, E5).
import { LANG_NAMES, RESPONSE_SCHEMA, buildPrompt } from './prompt.mjs';
import { consume, logCapRejection, refund, resolveTier } from '../_shared/passes.mjs';

import { withCors, readJson, bodyProblem } from '../_shared/http.mjs';

// The largest body this function reads (T1079): refused with 413 beyond it.
const MAX_BODY = 400000;

// Allow-Origin is set per request by withCors (an allow-list, not `*`; T1079).
const CORS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) => new Response(
  JSON.stringify(body),
  { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
);

const FOCUS_VALUES = ['city', 'nature', 'mix'];
const INTEREST_VALUES = ['landmarks', 'museums', 'food', 'nature', 'beach', 'active', 'photo', 'local'];

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'method' });

  // Provider and chain from config, the same rules as plan-day (aiModels).
  const envGet = (k: string) => Deno.env.get(k);
  const access = modelAccess('suggest-city', envGet);
  const GLOBAL_CAP = Number(Deno.env.get('AI_GLOBAL_DAILY_CAP')) || 200;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (access.refusal) return json(access.refusal.status, refusalBody(access.refusal));

  const authHeader = req.headers.get('Authorization') || '';
  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { code: 'auth' });

  let body: Record<string, unknown>;
  try { body = await readJson(req, MAX_BODY); } catch (e) { const p = bodyProblem(e); return json(p.status, { code: p.code }); }

  // ---- request validation (whitelist everything) ----
  const rawStay = (body.stay || null) as Record<string, unknown> | null;
  const stay = rawStay && Number.isFinite(Number(rawStay.lat)) && Number.isFinite(Number(rawStay.lon))
    ? { lat: Number(rawStay.lat), lon: Number(rawStay.lon) }
    : null;
  const focus = FOCUS_VALUES.includes(String(body.focus)) ? String(body.focus) : null;
  const interests = Array.isArray(body.interests)
    ? (body.interests as unknown[]).slice(0, 8).map((i) => String(i)).filter((i) => INTEREST_VALUES.includes(i))
    : [];
  const lang = LANG_NAMES[String(body.lang)] ? String(body.lang) : 'en';
  // ---- AI security: the wish and the deck are data, scrubbed before the cache key ----
  const inGuard = guardCityInput({
    freeText: cleanText(String(body.freeText ?? ''), 160),
    candidates: sanitizeTownCandidates(body.candidates),
  });
  const freeText = inGuard.freeText;
  const candidates = inGuard.candidates;
  if (candidates.length < 3) return json(400, { code: 'too_few' });

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- what is this traveller allowed to ask for? ----
  // Read-only: deciding whether grounding is on the table has to happen before
  // the cache key is built (the key includes the grounded flag), and reading
  // must not spend anything.
  // Live search needs a provider that has it (only Gemini today).
  const enabled = (Deno.env.get('AI_ENABLE_CITY_GROUNDING') || 'true').toLowerCase() !== 'false'
    && supportsSearch(access.cfg);
  const status = await resolveTier(service, user.id);
  let useGrounding = enabled && (status?.groundLeft ?? 0) > 0;
  // A free user still gets an answer here, just one drawn purely from Carta's
  // own catalogue rather than from live search. That is a genuinely weaker
  // product, which is the point: it is the difference the Trip Pass sells.
  let groundingSkipped = enabled && !useGrounding
    ? (status?.tier === 'free' ? 'tier' : 'cap')
    : null;

  // ---- quota gate ----
  // One suggestion costs one unit. A grounded one comes out of the grounded
  // allowance, because that is the surface Google actually meters. Ordered
  // before the cache for the same reason as plan-day: the allowance is a
  // product promise now, not just a cost guard.
  const kind = useGrounding ? 'ground' : 'plan';
  let quota = await consume(service, user.id, kind, GLOBAL_CAP);
  if (!quota.ok && kind === 'ground') {
    // Lost a race against the traveller's own last grounded call. Degrade
    // rather than refuse: an ungrounded answer beats an error. Degrade for
    // real, though: no 'ground' unit was spent, so this request must not run
    // grounded search either, and a later failure must refund the 'plan'
    // unit it actually consumed (refunding 'ground' would mint paid quota).
    logCapRejection(service, quota.status, 'ground', quota.tier);
    quota = await consume(service, user.id, 'plan', GLOBAL_CAP);
    useGrounding = false;
    groundingSkipped = 'cap';
  }
  if (quota.status === 'quota_check') return json(503, { code: 'quota_check' });
  if (!quota.ok) {
    // useGrounding, not kind. The degrade above rewrites quota with a 'plan'
    // consume, so after it the refusal being reported is a plan refusal even
    // though kind still says ground. Logging kind here would record a second
    // ground refusal for a call that only ever asked for a plan unit.
    logCapRejection(service, quota.status, useGrounding ? 'ground' : 'plan', quota.tier);
    return json(429, {
      code: quota.status, tier: quota.tier, cap: quota.cap ?? 0, used: quota.used ?? 0,
    });
  }
  const spentKind = useGrounding ? 'ground' : 'plan';
  const failed = async (st: number, b: Record<string, unknown>) => {
    await refund(service, user.id, spentKind);
    return json(st, b);
  };

  // ---- cache ----
  const hash = await sha256Hex(cacheKeyInput({
    // The chain, not the answering model: see plan-day for why.
    model: chainKey(access.cfg), stay, focus, interests, freeText, lang, candidates, grounded: useGrounding,
  }));
  const { data: cached } = await service
    .from('ai_plan_cache')
    .select('payload, created_at')
    .eq('hash', hash)
    .maybeSingle();
  // A cached row passes the same output check as a fresh answer; one that
  // fails it is a miss and is regenerated.
  const cachedSafe = cached?.payload && Date.now() - Date.parse(cached.created_at) < 7 * 86400_000
    ? guardCityPayload(cached.payload)
    : null;
  if (cachedSafe) {
    return json(200, {
      ...cachedSafe,
      meta: { ...cachedSafe.meta, cached: true },
      pass: { tier: quota.tier, left: quota.left ?? null },
    });
  }

  // ---- the one AI call ----
  const prompt = buildPrompt({
    stayLabel: stay ? 'their stay' : 'the area', focus, interests, freeText, lang, candidates,
    groundedFormat: useGrounding,
  });
  const nonce = makeNonce();
  const security = systemRules(nonce);
  if (prompt.length > LIMITS.cityPromptChars) return await failed(400, { code: 'too_big' });
  const ai = await callModel({
    feature: 'suggest-city',
    env: envGet,
    system: security,
    user: prompt,
    // Grounding and a response schema are mutually exclusive on Gemini:
    // aiModels sends the schema only when search is off.
    json: true,
    schema: RESPONSE_SCHEMA,
    search: useGrounding,
    temperature: 0.3,
    // gemini-flash-latest is a THINKING model and its thoughts are charged
    // against this budget: a 120-candidate ask burns about 2,000 tokens
    // thinking, so 2048 truncated the JSON. Only generated tokens are billed.
    maxOutputTokens: 8192,
  });
  if (!ai.ok) return await failed(ai.status, refusalBody(ai));
  const usedModel: string = ai.model;

  if (ai.text.length > LIMITS.modelOutputChars) return await failed(502, { code: 'ai_bad_output' });
  // A grounded call cannot use a response schema, so the reply is parsed
  // loosely (a fenced block or the outermost {...}); sanitizeSuggestions()
  // is the real safety net either way.
  const outGuard = guardCityOutput(parseModelJson(ai.text, { loose: true }), { systemText: `${security}\n${prompt}` });
  if (!outGuard.value) return await failed(502, { code: 'ai_bad_output' });
  const parsed = outGuard.value;

  const suggestions = sanitizeSuggestions(parsed.suggestions, candidates, stay);
  if (!suggestions.length) return await failed(502, { code: 'ai_bad_output' });

  const payload = guardCityPayload({
    suggestions,
    meta: {
      model: usedModel, fellBack: ai.fellBack, cached: false,
      grounded: useGrounding, groundingSkipped,
      // What the AI guard did (T1137): input fields scrubbed, suggestions
      // dropped for their shape, fields repaired. Counts and names only.
      guard: { input: inGuard.flags, dropped: outGuard.dropped, repaired: outGuard.repaired },
    },
  });
  if (!payload || !payload.suggestions.length) return await failed(502, { code: 'ai_bad_output' });

  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: usedModel }); } catch { /* ignore */ }

  // Entitlement facts stay outside the cached payload: that row is shared.
  return json(200, { ...payload, pass: { tier: quota.tier, left: quota.left ?? null } });
}, { methods: 'POST, OPTIONS', extraOrigins: () => Deno.env.get('ALLOWED_ORIGINS') || '' }));
