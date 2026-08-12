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
 * public.plan_tiers, not from env.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanText, modelChain, shouldFallOver } from '../plan-day/logic.mjs';
import { sanitizeTownCandidates, sanitizeSuggestions, cacheKeyInput } from './logic.mjs';
import { consume, refund, resolveTier } from '../_shared/passes.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) => new Response(
  JSON.stringify(body),
  { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
);

const LANG_NAMES: Record<string, string> = {
  en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
};

const FOCUS_VALUES = ['city', 'nature', 'mix'];
const INTEREST_VALUES = ['landmarks', 'museums', 'food', 'nature', 'beach', 'active', 'photo', 'local'];

// Gemini's API rejects combining the google_search tool with
// responseSchema/responseMimeType in one call (grounding and controlled
// generation are mutually exclusive server-side, as of this writing). Since
// grounding is the entire point of this endpoint and stays on by default,
// the schema below is only actually SENT when grounding is off; when
// grounding is on, the same shape is spelled out in the prompt instead and
// the reply is parsed defensively (extractJson, below).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'Candidate id, required when inCatalog is true.' },
          name: { type: 'STRING' },
          country: { type: 'STRING' },
          why: { type: 'STRING', description: 'One short, concrete sentence: why this place fits the ask.' },
          inCatalog: { type: 'BOOLEAN' },
          lat: { type: 'NUMBER', description: 'Only for inCatalog=false discoveries.' },
          lon: { type: 'NUMBER', description: 'Only for inCatalog=false discoveries.' },
        },
        required: ['name', 'why', 'inCatalog'],
      },
    },
  },
  required: ['suggestions'],
};

function buildPrompt(p: {
  stayLabel: string; focus: string | null; interests: string[]; freeText: string; lang: string;
  candidates: ReturnType<typeof sanitizeTownCandidates>; groundedFormat: boolean;
}) {
  const langName = LANG_NAMES[p.lang] || 'English';
  const lines = [
    `You are Carta's destination scout: given what a traveller wants, suggest up to 5 great towns or cities for a day trip from ${p.stayLabel}.`,
    '',
    'CANDIDATES (JSON, real destinations Carta already has day-planning data for; id, name, country, distance in km from the stay, traveller rating 0-10 when known, descriptive tags):',
    JSON.stringify(p.candidates),
    '',
    'RULES:',
    '- Prefer a candidate from the list above (id present, inCatalog=true) whenever one genuinely fits: Carta already has rich day-planning data for it.',
    '- If the traveller is clearly asking for something none of the candidates cover, you may suggest a REAL place beyond the list with inCatalog=false, its own name, country and approximate coordinates. Never invent a candidate id for a place that is not actually one of the candidates.',
    '- Return 3 to 5 suggestions, best fit first. Do not pad with weak fits just to reach 5.',
    p.focus === 'nature' ? '- They lean toward nature: parks, water, viewpoints, green space over indoor city sights.' : '',
    p.focus === 'city' ? '- They lean toward the built city: streets, squares, architecture, museums.' : '',
    p.interests.length ? `- What they care about most: ${p.interests.join(', ')}.` : '',
    p.freeText
      ? `- Their own wish, treat as the main brief: "${p.freeText}".`
      : '- No specific wish given beyond the mood above: pick well-rounded, strong fits.',
    `- Write "why" and "country" in ${langName}. Keep "why" to one short, concrete sentence.`,
    '- Never use em dashes or en dashes in any text.',
    p.groundedFormat ? [
      '',
      'OUTPUT FORMAT: reply with ONLY a single JSON object, no markdown code fences, no commentary before or after it, exactly this shape:',
      '{"suggestions":[{"id":"candidate id string, ONLY when inCatalog is true","name":"string","country":"string","why":"one short sentence","inCatalog":true,"lat":0,"lon":0}]}',
      '("lat"/"lon" only when inCatalog is false; omit "id" when inCatalog is false.)',
    ].join('\n') : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Best-effort JSON extraction: a direct parse, then a fenced ```json block,
 * then the outermost {...} span. Needed because a grounded call cannot use
 * responseSchema, so the model's adherence to the prompted shape is a strong
 * convention, not a server-enforced guarantee. sanitizeSuggestions() is the
 * real safety net regardless of which path parses. */
function extractJson(text: string): unknown {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(text.trim());
  if (v !== undefined) return v;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) { v = tryParse(fence[1]); if (v !== undefined) return v; }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) { v = tryParse(text.slice(first, last + 1)); if (v !== undefined) return v; }
  return undefined;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { code: 'method' });

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
  // Same ordered fallback chain as plan-day, from the shared logic module.
  const CHAIN = modelChain(Deno.env.get('GEMINI_MODEL'), Deno.env.get('GEMINI_MODELS'));
  const GLOBAL_CAP = Number(Deno.env.get('AI_GLOBAL_DAILY_CAP')) || 200;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!GEMINI_API_KEY) return json(503, { code: 'no_ai' });

  const authHeader = req.headers.get('Authorization') || '';
  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { code: 'auth' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { code: 'bad_json' }); }

  // ---- request validation (whitelist everything) ----
  const rawStay = (body.stay || null) as Record<string, unknown> | null;
  const stay = rawStay && Number.isFinite(Number(rawStay.lat)) && Number.isFinite(Number(rawStay.lon))
    ? { lat: Number(rawStay.lat), lon: Number(rawStay.lon) }
    : null;
  const focus = FOCUS_VALUES.includes(String(body.focus)) ? String(body.focus) : null;
  const interests = Array.isArray(body.interests)
    ? (body.interests as unknown[]).slice(0, 8).map((i) => String(i)).filter((i) => INTEREST_VALUES.includes(i))
    : [];
  const freeText = cleanText(String(body.freeText ?? ''), 160);
  const lang = LANG_NAMES[String(body.lang)] ? String(body.lang) : 'en';
  const candidates = sanitizeTownCandidates(body.candidates);
  if (candidates.length < 3) return json(400, { code: 'too_few' });

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- what is this traveller allowed to ask for? ----
  // Read-only: deciding whether grounding is on the table has to happen before
  // the cache key is built (the key includes the grounded flag), and reading
  // must not spend anything.
  const enabled = (Deno.env.get('AI_ENABLE_CITY_GROUNDING') || 'true').toLowerCase() !== 'false';
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
    quota = await consume(service, user.id, 'plan', GLOBAL_CAP);
    useGrounding = false;
    groundingSkipped = 'cap';
  }
  if (quota.status === 'quota_check') return json(503, { code: 'quota_check' });
  if (!quota.ok) {
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
    model: CHAIN.join(','), stay, focus, interests, freeText, lang, candidates, grounded: useGrounding,
  }));
  const { data: cached } = await service
    .from('ai_plan_cache')
    .select('payload, created_at')
    .eq('hash', hash)
    .maybeSingle();
  if (cached?.payload && Date.now() - Date.parse(cached.created_at) < 7 * 86400_000) {
    return json(200, {
      ...cached.payload,
      meta: { ...cached.payload.meta, cached: true },
      pass: { tier: quota.tier, left: quota.left ?? null },
    });
  }

  // ---- the one AI call ----
  const prompt = buildPrompt({
    stayLabel: stay ? 'their stay' : 'the area', focus, interests, freeText, lang, candidates,
    groundedFormat: useGrounding,
  });
  let aiText = '';
  let usedModel = '';
  let lastStatus = 0;
  for (const model of CHAIN) {
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            // Grounding and responseSchema are mutually exclusive on Gemini's
            // API: send one or the other, never both.
            ...(useGrounding ? { tools: [{ google_search: {} }] } : {}),
            generationConfig: {
              temperature: 0.3,
            // Generous ceiling because gemini-flash-latest now resolves to a
            // THINKING model, and its thoughts are charged against this same
            // budget: a real 120-candidate ask burns ~1700-2200 tokens
            // thinking before writing a word, so the old 2048 truncated the
            // JSON mid-object and every call died as ai_bad_output. A ceiling
            // is not a cost, only generated tokens are, so headroom is free.
              // thinkingBudget does not help: Gemini 3 accepts the field and
              // ignores it.
              maxOutputTokens: 8192,
              ...(useGrounding
                ? {}
                : { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }),
            },
          }),
          signal: AbortSignal.timeout(45_000),
        },
      );
    } catch {
      // Timeouts stop the chain: see plan-day, latency beats completeness.
      return await failed(504, { code: 'ai_timeout' });
    }
    if (!resp.ok) {
      lastStatus = resp.status;
      if (shouldFallOver(resp.status)) continue;
      return await failed(502, { code: 'ai_error', status: resp.status });
    }
    const data = await resp.json();
    aiText = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || '')
      .join('');
    usedModel = model;
    break;
  }
  if (!usedModel) {
    return lastStatus === 429
      ? await failed(429, { code: 'global_cap' })
      : await failed(502, { code: 'ai_error', status: lastStatus });
  }

  const parsed = extractJson(aiText) as { suggestions?: unknown } | undefined;
  if (!parsed) return await failed(502, { code: 'ai_bad_output' });

  const suggestions = sanitizeSuggestions(parsed.suggestions, candidates, stay);
  if (!suggestions.length) return await failed(502, { code: 'ai_bad_output' });

  const payload = {
    suggestions,
    meta: {
      model: usedModel, fellBack: usedModel !== CHAIN[0], cached: false,
      grounded: useGrounding, groundingSkipped,
    },
  };

  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: usedModel }); } catch { /* ignore */ }

  // Entitlement facts stay outside the cached payload: that row is shared.
  return json(200, { ...payload, pass: { tier: quota.tier, left: quota.left ?? null } });
});
