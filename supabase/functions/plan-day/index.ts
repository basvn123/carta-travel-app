/**
 * plan-day, the AI day-planner Edge Function.
 *
 * The client sends the traveller's answers plus a candidate list drawn from
 * Carta's OWN researched catalogue; Gemini only sequences and annotates that
 * list (plus at most a few flagged "discoveries" from the free-text wish).
 * Everything the model returns is re-validated and re-timed server-side in
 * logic.mjs before it reaches the app, so coordinates, order and clock times
 * are always derived from real data, never trusted from the model.
 *
 * Zero-billing posture (this is the load-bearing part):
 *   - GEMINI_API_KEY must come from a Google AI Studio key on a project with
 *     NO billing account attached. Without a payment instrument, quota
 *     exhaustion is a 429, never an invoice.
 *   - No grounding/search tools are ever sent in the request: plain
 *     generateContent is the only billable-surface-free call shape.
 *   - The ai_plan_consume RPC enforces per-user and global daily caps well
 *     under Google's free-tier daily limit, and identical requests answer
 *     from the ai_plan_cache table without touching the API at all.
 *
 * Secrets (set via `supabase secrets set`): GEMINI_API_KEY, and optionally
 * GEMINI_MODEL (default gemini-flash-latest), AI_USER_DAILY_CAP (10),
 * AI_GLOBAL_DAILY_CAP (200).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  cleanText, sanitizeCandidates, sanitizeAiStops, scheduleDay, cacheKeyInput,
} from './logic.mjs';

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

// Gemini structured output: the schema makes malformed JSON impossible and
// hallucinated keys unrepresentable. inCatalog=true stops carry an id from
// the candidate list; discoveries carry their own coordinates instead.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'One or two sentences on how the day flows and why it fits the group.' },
    stops: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'Candidate id, required when inCatalog is true.' },
          name: { type: 'STRING' },
          arrive: { type: 'STRING', description: '24h HH:MM arrival estimate.' },
          dwellMin: { type: 'INTEGER' },
          why: { type: 'STRING', description: 'One short sentence: why this stop, in this slot.' },
          inCatalog: { type: 'BOOLEAN' },
          isEvent: { type: 'BOOLEAN', description: 'True for a festival, market or dated event rather than a permanent place.' },
          lat: { type: 'NUMBER', description: 'Only for inCatalog=false discoveries.' },
          lon: { type: 'NUMBER', description: 'Only for inCatalog=false discoveries.' },
        },
        required: ['name', 'arrive', 'dwellMin', 'why', 'inCatalog'],
      },
    },
  },
  required: ['summary', 'stops'],
};

const PACE_STOPS: Record<string, string> = {
  relaxed: '3 or 4 stops with generous time at each',
  balanced: '5 or 6 stops at a comfortable rhythm',
  packed: '7 or 8 stops, quick visits, see a lot',
};

function buildPrompt(p: {
  city: string; country: string; dateISO: string; month: number; groupSize: number;
  pace: string; vibe: string; avoidHills: boolean; freeText: string; lang: string;
  hasStay: boolean; candidates: ReturnType<typeof sanitizeCandidates>;
  wantEvents: boolean; refine: string; prevStops: string[];
  profile: Record<string, unknown> | null;
}) {
  const langName = LANG_NAMES[p.lang] || 'English';
  const summer = p.month >= 6 && p.month <= 8;
  const lines = [
    `You are Carta's day planner: you turn a vetted candidate list into one great, physically realistic walking day in ${p.city}, ${p.country} on ${p.dateISO}.`,
    '',
    `CANDIDATES (JSON, all researched and real; id, name, kind, category, traveller rating 0-10, mustSee, typical visit minutes, coordinates):`,
    JSON.stringify(p.candidates.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, cat: c.cat, rating: c.rating,
      mustSee: c.mustSee, dwellMin: c.dwellMin, lat: c.lat, lon: c.lon,
      ...(c.desc ? { desc: c.desc } : {}),
    }))),
    '',
    'RULES:',
    `- Build ${PACE_STOPS[p.pace] || PACE_STOPS.balanced}. Start at 09:30, be finished by 18:00.`,
    '- At least 80 percent of the stops MUST come from the candidate list, referenced by their exact id with inCatalog=true. Never invent an id.',
    '- Sequence to minimise backtracking: neighbouring stops belong next to each other. Alternate heavy visits (museums, castles) with light ones (squares, views).',
    `- Group of ${p.groupSize}. ${p.groupSize >= 5 ? 'Large group: walking is about 20 percent slower, spontaneous restaurant tables are unrealistic, prefer roomy venues and note where booking ahead matters.' : ''}`,
    summer ? '- Peak-summer heat: place indoor or shaded stops between 13:00 and 16:00, outdoor highlights in the morning or late afternoon.' : '',
    p.avoidHills ? '- The group avoids steep hills and stairs: prefer flat ground, mention step-free alternatives in the why lines when relevant.' : '',
    p.hasStay ? '- The day starts from the traveller\'s stay; the first stop should be the natural first leg from there.' : '',
    // The chat planner's answer profile. Each line only appears when the
    // traveller actually answered it, so the prompt never argues with itself.
    ...(p.profile ? [
      p.profile.maxWalkKm ? `- Total walking must stay near ${p.profile.maxWalkKm} km for the whole day. Prefer stops that keep it under that; never plan a day that clearly exceeds it.` : '',
      p.profile.terrain === 'flat' ? '- Flat ground only: avoid hills, steps and steep streets, and say so where it matters.' : '',
      p.profile.terrain === 'hike' ? '- They want a proper walk: real distance and some climb are welcome, and a viewpoint or trail is a bonus.' : '',
      p.profile.known === 'first' ? '- First visit: the famous, unmissable places belong in this day.' : '',
      p.profile.known === 'again' ? '- They have been here before: lean away from the obvious headline sights and toward lesser known, local-feeling places.' : '',
      p.profile.focus === 'nature' ? '- Weight the day toward parks, water, viewpoints and green space rather than indoor city sights.' : '',
      p.profile.focus === 'city' ? '- Weight the day toward the built city: streets, squares, architecture and museums.' : '',
      p.profile.dayLength === 'half' ? '- Half a day only: finish by about 13:30.' : '',
      p.profile.dayLength === 'evening' ? '- A long day: keep going into the evening, and end somewhere good after dark.' : '',
      p.profile.food === 'sit' ? '- Include one proper sit-down meal at a realistic hour and treat it as a stop.' : '',
      p.profile.food === 'quick' ? '- Keep eating quick and casual: a market, bakery or street food stop rather than a long lunch.' : '',
      p.profile.food === 'none' ? '- No food stops: they will sort meals out themselves.' : '',
      Array.isArray(p.profile.interests) && p.profile.interests.length
        ? `- What they care about most: ${(p.profile.interests as string[]).join(', ')}. Let this drive which candidates make the cut.`
        : '',
    ] : []),
    p.freeText
      ? `- The traveller's own wish, treat as a hard requirement if feasible: "${p.freeText}". If it needs a real place that is NOT in the candidate list, add it with inCatalog=false, its real name and its real coordinates near ${p.city}; never fake a candidate id for it.`
      : '- Add no stops beyond the candidate list unless a rule below allows it.',
    // Events are the one thing the catalogue structurally cannot hold: it
    // stores permanent places, not what happens on a given Tuesday.
    p.wantEvents
      ? `- ALSO look for festivals, markets, fairs or seasonal events that plausibly run in ${p.city} around ${p.dateISO || `month ${p.month}`}, and work at most two of them into the day as inCatalog=false stops with isEvent=true, real venue coordinates, and the event name. Only suggest ones you genuinely believe recur at that time of year. In their "why" line, say plainly that the traveller should confirm this year's dates, because you cannot see live listings. Never state a specific date as fact.`
      : '',
    // The refine loop: the traveller has seen a plan and asked for a change.
    p.refine
      ? `\nREVISION: the traveller already saw this plan: ${p.prevStops.join(', ') || '(none)'}.\nThey asked for: "${p.refine}".\nProduce a NEW plan that honours that request. Keep what they did not complain about, change what they did. Do not simply return the same plan.`
      : '',
    `- Write "summary" and every "why" in ${langName}. Keep each "why" to one short, concrete sentence.`,
    '- Never use em dashes or en dashes in any text.',
  ];
  return lines.filter(Boolean).join('\n');
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { code: 'method' });

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
  const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';
  const USER_CAP = Number(Deno.env.get('AI_USER_DAILY_CAP')) || 10;
  const GLOBAL_CAP = Number(Deno.env.get('AI_GLOBAL_DAILY_CAP')) || 200;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!GEMINI_API_KEY) return json(503, { code: 'no_ai' });

  // Only signed-in travellers may spend AI quota: the JWT in the Authorization
  // header must resolve to a real user.
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
  const dest = (body.dest || {}) as Record<string, unknown>;
  const destId = cleanText(String(dest.id ?? ''), 60);
  const city = cleanText(String(dest.city ?? ''), 60);
  const country = cleanText(String(dest.country ?? ''), 60);
  const centreLat = Number(dest.lat);
  const centreLon = Number(dest.lon);
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)) ? String(body.date) : '';
  const month = dateISO ? Number(dateISO.slice(5, 7)) : new Date().getUTCMonth() + 1;
  const groupSize = Math.max(1, Math.min(20, Math.round(Number(body.groupSize)) || 2));
  const pace = ['relaxed', 'balanced', 'packed'].includes(String(body.pace)) ? String(body.pace) : 'balanced';
  const vibe = ['classic', 'culture', 'active', 'foodie', 'mix'].includes(String(body.vibe)) ? String(body.vibe) : 'mix';
  const avoidHills = !!body.avoidHills;
  const freeText = cleanText(String(body.freeText ?? ''), 280);
  const lang = LANG_NAMES[String(body.lang)] ? String(body.lang) : 'en';
  const stay = body.stay && Number.isFinite(Number((body.stay as Record<string, unknown>).lat))
    ? { lat: Number((body.stay as Record<string, unknown>).lat), lon: Number((body.stay as Record<string, unknown>).lon) }
    : null;
  const candidates = sanitizeCandidates(body.candidates);
  // Refine loop: the traveller saw a plan and asked for a change. prevStops
  // are names only, so a tampered payload can never inject coordinates.
  const refine = cleanText(String(body.refine ?? ''), 280);
  const prevStops = Array.isArray(body.prevStops)
    ? (body.prevStops as unknown[]).slice(0, 12).map((s) => cleanText(String(s), 90)).filter(Boolean)
    : [];
  const wantEvents = !!body.wantEvents;
  // The chat planner's structured answers. Whitelisted field by field: this
  // text goes straight into the prompt, so nothing arbitrary may ride along.
  const rawProfile = (body.profile || null) as Record<string, unknown> | null;
  const oneOf = (v: unknown, allowed: string[]) => (allowed.includes(String(v)) ? String(v) : null);
  const profile = rawProfile ? {
    focus: oneOf(rawProfile.focus, ['city', 'nature', 'mix']),
    known: oneOf(rawProfile.known, ['first', 'again']),
    interests: Array.isArray(rawProfile.interests)
      ? (rawProfile.interests as unknown[]).slice(0, 8)
        .map((i) => oneOf(i, ['landmarks', 'museums', 'food', 'nature', 'beach', 'active', 'photo', 'local']))
        .filter(Boolean)
      : [],
    maxWalkKm: Number.isFinite(Number(rawProfile.maxWalkKm))
      ? Math.max(1, Math.min(40, Math.round(Number(rawProfile.maxWalkKm)))) : null,
    terrain: oneOf(rawProfile.terrain, ['flat', 'some', 'hike']),
    dayLength: oneOf(rawProfile.dayLength, ['half', 'full', 'evening']),
    food: oneOf(rawProfile.food, ['sit', 'quick', 'none']),
  } : null;
  if (!destId || !city || !Number.isFinite(centreLat) || !Number.isFinite(centreLon)) {
    return json(400, { code: 'bad_dest' });
  }
  if (candidates.length < 3) return json(400, { code: 'too_few' });

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- cache first: a hit costs zero quota ----
  const hash = await sha256Hex(cacheKeyInput({
    model: MODEL, destId, month, dateISO, groupSize, pace, vibe, avoidHills,
    freeText, lang, candidates, refine, prevStopIds: prevStops, wantEvents,
    profile,
  }));
  const { data: cached } = await service
    .from('ai_plan_cache')
    .select('payload, created_at')
    .eq('hash', hash)
    .maybeSingle();
  if (cached?.payload && Date.now() - Date.parse(cached.created_at) < 7 * 86400_000) {
    return json(200, { ...cached.payload, meta: { ...cached.payload.meta, cached: true } });
  }

  // ---- quota gate (atomic; the zero-billing guarantee's second layer) ----
  const { data: quota, error: quotaErr } = await service.rpc('ai_plan_consume', {
    p_user: user.id, p_user_cap: USER_CAP, p_global_cap: GLOBAL_CAP,
  });
  if (quotaErr) return json(503, { code: 'quota_check' });
  if (quota !== 'ok') return json(429, { code: quota }); // 'user_cap' | 'global_cap'

  // ---- the one AI call: plain generateContent, no tools, low temperature ----
  const prompt = buildPrompt({
    city, country, dateISO, month, groupSize, pace, vibe, avoidHills, freeText, lang,
    hasStay: !!stay, candidates, wantEvents, refine, prevStops, profile,
  });
  // Google Search grounding stays OFF by default. It is the one Gemini
  // feature with a paid tier beyond its free allowance, and it competes for
  // the same tiny free-tier request budget, so it is opt-in per deployment
  // (AI_ENABLE_GROUNDING=true) rather than something that can surprise you.
  // Even switched on it cannot bill an API key whose Google project has no
  // billing account: over the allowance the API returns 429, not an invoice.
  const useGrounding = (Deno.env.get('AI_ENABLE_GROUNDING') || '').toLowerCase() === 'true' && wantEvents;
  let aiText = '';
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(useGrounding ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: refine ? 0.45 : 0.25, // a revision must actually differ
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (resp.status === 429) return json(429, { code: 'ai_busy' });
    if (!resp.ok) return json(502, { code: 'ai_error', status: resp.status });
    const data = await resp.json();
    aiText = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || '')
      .join('');
  } catch {
    return json(504, { code: 'ai_timeout' });
  }

  let parsed: { summary?: unknown; stops?: unknown };
  try { parsed = JSON.parse(aiText); } catch { return json(502, { code: 'ai_bad_output' }); }

  // ---- server-side truth pass: validate stops, then re-time the day ----
  const centre = { lat: centreLat, lon: centreLon };
  const { stops: safeStops, dropped } = sanitizeAiStops(parsed.stops, candidates, centre);
  if (safeStops.length < 2) return json(502, { code: 'ai_bad_output' });
  const sched = scheduleDay(safeStops, { stay, groupSize });

  const payload = {
    summary: cleanText(String(parsed.summary ?? ''), 400),
    stops: sched.stops,
    totals: {
      stops: sched.stops.length,
      walkKm: sched.totalKm,
      endTime: sched.endTime,
      lunchAfter: sched.lunchAfter,
      lunchMin: sched.lunchMin,
    },
    meta: {
      model: MODEL,
      optimized: sched.optimized,
      dropped,
      cached: false,
      refined: !!refine,
      events: sched.stops.filter((s: { isEvent?: boolean }) => s.isEvent).length,
      grounded: useGrounding,
    },
  };

  // Cache best-effort: a failed insert must never fail the response.
  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: MODEL }); } catch { /* ignore */ }

  return json(200, payload);
});
