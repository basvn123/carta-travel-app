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
 * Billing posture (this is the load-bearing part, and it CHANGED in 007).
 * GEMINI_API_KEY must come from a Google Cloud project WITH an active billing
 * account. Google's Gemini API Additional Terms, effective 2026-03-23:
 *
 *   "You may use only Paid Services when making API Clients available to
 *    users in the European Economic Area, Switzerland, or the United
 *    Kingdom."
 *
 * Carta's travellers are European, so the old unbilled-key posture is not
 * available to us. "Paid Services" is defined by the billing account existing
 * rather than by money being charged, so attaching billing is the compliance
 * step, not a decision to start spending. What protects the wallet now:
 *   - Tiered fair-use caps enforced by the ai_consume RPC (migration 007),
 *     counted per entitlement period rather than per day.
 *   - Grounded search, the one surface Google meters per query, is paid-tier
 *     only and carries its OWN counter ('ground'), because on Gemini 3 a
 *     single grounded generation bills per search the model chooses to run.
 *   - A global daily ceiling as an abuse backstop.
 *   - The ai_plan_cache table, where identical requests cost nothing at all.
 *
 * Secrets (set via `supabase secrets set`): GEMINI_API_KEY, and optionally
 * GEMINI_MODEL (default gemini-flash-latest), AI_GLOBAL_DAILY_CAP (200).
 * Per-user caps now come from public.plan_tiers, not from env.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  cleanText, sanitizeCandidates, sanitizeAiStops, scheduleDay, cacheKeyInput,
  modelChain, shouldFallOver,
} from './logic.mjs';
import { consume, refund } from '../_shared/passes.mjs';

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
  // Ordered models to try. Each has its own free daily budget, so exhausting
  // the first is a reason to step down a rung, not to fail the request.
  const CHAIN = modelChain(Deno.env.get('GEMINI_MODEL'), Deno.env.get('GEMINI_MODELS'));
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

  // ---- quota gate (atomic, tier-aware) ----
  // ORDER MATTERS, and it changed in 007. The cache lookup used to run first,
  // because under the old zero-billing posture quota existed only to protect
  // the free Gemini budget and a cache hit spent none of it. Now quota is what
  // the traveller is BUYING, so it has to be a product rule rather than a cost
  // passthrough: "3 AI plans a month" has to mean three, including in Paris
  // where somebody else's identical question is already cached. Leaving the
  // cache first would have handed free users unlimited plans in exactly the
  // popular cities most people plan.
  //
  // The one cost of this ordering: a cache hit now also ticks the global daily
  // ceiling, which it does not actually spend anything against. That errs
  // toward under-serving rather than over-spending, which is the right way to
  // be wrong.
  //
  // The response carries the tier and what is left of it so the client can
  // render "2 of 3 plans left this month" and put the upsell in front of a
  // free user at the exact moment the limit bites.
  const quota = await consume(service, user.id, 'plan', GLOBAL_CAP);
  if (quota.status === 'quota_check') return json(503, { code: 'quota_check' });
  if (!quota.ok) {
    return json(429, {
      code: quota.status, // 'user_cap' | 'global_cap'
      tier: quota.tier,
      cap: quota.cap ?? 0,
      used: quota.used ?? 0,
    });
  }

  // ---- cache: a hit still costs a unit, but costs Google nothing ----
  // Keyed on the CHAIN, not on whichever model happened to answer: the same
  // question must hit the same cache row whether the primary served it or a
  // fallback did, or a busy day would generate the identical plan twice.
  const hash = await sha256Hex(cacheKeyInput({
    model: CHAIN.join(','), destId, month, dateISO, groupSize, pace, vibe, avoidHills,
    freeText, lang, candidates, refine, prevStopIds: prevStops, wantEvents,
    profile,
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
      pass: { tier: quota.tier, plansLeft: quota.left ?? null },
    });
  }

  // Everything spent from here on has to be returned if the day never gets
  // built. Quota is now a thing travellers PAY for, so an outage on our side
  // must not quietly cost them a generation.
  const spent: string[] = ['plan'];
  const failed = async (status: number, body: Record<string, unknown>) => {
    for (const kind of spent) await refund(service, user.id, kind);
    return json(status, body);
  };

  // ---- the one AI call: plain generateContent, no tools, low temperature ----
  const prompt = buildPrompt({
    city, country, dateISO, month, groupSize, pace, vibe, avoidHills, freeText, lang,
    hasStay: !!stay, candidates, wantEvents, refine, prevStops, profile,
  });
  // Google Search grounding is the paid feature, and the only one here that
  // reliably costs money: on Gemini 3 it bills per individual search query the
  // model decides to run, so one grounded day can be several billed units.
  // It therefore takes its own quota ('ground'), which the free tier has none
  // of. AI_ENABLE_GROUNDING remains a deployment-wide off switch on top.
  //
  // Falling short of grounding DEGRADES the request, it does not fail it: the
  // traveller still gets their day, just built without live listings, and
  // meta.groundingSkipped tells the client which upsell to show. Refusing
  // outright would punish a free user for ticking a box they were shown.
  const groundingEnabled = (Deno.env.get('AI_ENABLE_GROUNDING') || '').toLowerCase() !== 'false';
  let groundingSkipped: string | null = null;
  let useGrounding = false;
  if (wantEvents) {
    if (!groundingEnabled) {
      groundingSkipped = 'off';
    } else {
      const g = await consume(service, user.id, 'ground', GLOBAL_CAP);
      if (g.ok) { useGrounding = true; spent.push('ground'); }
      else groundingSkipped = g.tier === 'free' ? 'tier' : 'cap';
    }
  }
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
            ...(useGrounding ? { tools: [{ google_search: {} }] } : {}),
            generationConfig: {
              temperature: refine ? 0.45 : 0.25, // a revision must actually differ
              // See suggest-city: gemini-flash-latest is a thinking model now
              // and its thoughts spend this budget, so a full day of stops can
              // truncate at 4096 and come back as ai_bad_output. Headroom costs
              // nothing, only generated tokens are billed.
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(45_000),
        },
      );
    } catch {
      // A timeout is not a budget problem, and walking the rest of the chain
      // could hold the traveller for minutes. Give up while it still feels
      // like a failed request rather than a hung app.
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
  // Chain exhausted. A trailing 429 means every model's budget is spent, which
  // for the traveller is exactly the "come back tomorrow" case the quota copy
  // already describes, so say that rather than "hiccup".
  if (!usedModel) {
    return lastStatus === 429
      ? await failed(429, { code: 'global_cap' })
      : await failed(502, { code: 'ai_error', status: lastStatus });
  }

  let parsed: { summary?: unknown; stops?: unknown };
  try { parsed = JSON.parse(aiText); } catch { return await failed(502, { code: 'ai_bad_output' }); }

  // ---- server-side truth pass: validate stops, then re-time the day ----
  const centre = { lat: centreLat, lon: centreLon };
  const { stops: safeStops, dropped } = sanitizeAiStops(parsed.stops, candidates, centre);
  if (safeStops.length < 2) return await failed(502, { code: 'ai_bad_output' });
  // The traveller's own walking answer is ENFORCED here, not merely asked of
  // the model above: the prompt line is a request, this is the guarantee.
  const sched = scheduleDay(safeStops, {
    stay, groupSize, maxWalkKm: profile?.maxWalkKm ?? undefined,
  });
  // Nothing here forms a walkable cluster (a deck whose good places are
  // scattered across the whole 20 km radius). That is not a malformed AI
  // answer, it is a city that cannot give this traveller a walking day, which
  // is exactly what `too_few` already tells them while offering the built-in
  // planner. A one-stop "route" would be worse than saying so.
  if (sched.stops.filter((s: { arrive?: string | null }) => s.arrive).length < 2) {
    return await failed(400, { code: 'too_few' });
  }

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
      model: usedModel,
      // True when the primary was unavailable and a lower rung answered.
      // Worth surfacing in logs: a day of this means the free budget on the
      // good model is consistently gone before travellers get to it.
      fellBack: usedModel !== CHAIN[0],
      optimized: sched.optimized,
      dropped,
      // Stops the model chose that were past the day's walking budget. A
      // number that stays high in the logs means the candidate deck is
      // handing the model places no walking day can reach.
      farDropped: sched.farDropped,
      fromStay: sched.fromStay,
      cached: false,
      refined: !!refine,
      events: sched.stops.filter((s: { isEvent?: boolean }) => s.isEvent).length,
      grounded: useGrounding,
      // Why live search did not run, when it was asked for: 'tier' (free
      // plan), 'cap' (pass fair-use spent) or 'off' (disabled server-wide).
      // The first two are the upsell moments.
      groundingSkipped,
    },
  };

  // Cache best-effort: a failed insert must never fail the response.
  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: usedModel }); } catch { /* ignore */ }

  // Entitlement facts ride OUTSIDE payload so they never reach the cache: the
  // cached row is shared between users, and one traveller's remaining balance
  // must not be served to the next.
  return json(200, {
    ...payload,
    pass: { tier: quota.tier, plansLeft: quota.left ?? null },
  });
});
