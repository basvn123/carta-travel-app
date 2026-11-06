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
 * rather than by money being charged: the terms say Gemini API access is a
 * Paid Service when it is reached through a Cloud Project with an active
 * Cloud Billing account. Attaching billing is therefore the compliance step,
 * not a decision to start spending. Verify with
 * `gcloud billing projects describe PROJECT_ID` on the project that issued
 * GEMINI_API_KEY and expect `billingEnabled: true`; re-verify after any key
 * rotation, since a new key may come from a different project.
 *
 * Because the account can now be charged, the caps below are a COST CEILING
 * rather than a billing impossibility. They have to actually hold. What
 * protects the wallet now:
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
 * Provider and model chain (T1137): AI_PLAN_DAY_PROVIDER, AI_PLAN_DAY_MODELS
 * and the other keys in supabase/functions/_shared/aiModels.mjs.
 * Per-user caps now come from public.plan_tiers, not from env.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  cleanText, sanitizeCandidates, selectCandidates, dayCentroid, sanitizeAiStops,
  scheduleDay, cacheKeyInput, CACHE_KEY_VERSION,
  signRefineToken, verifyRefineToken, REFINES_FREE,
} from './logic.mjs';
import { consume, logCapRejection, logModelEvent, refund } from '../_shared/passes.mjs';

import { withCors, readJson, bodyProblem } from '../_shared/http.mjs';
// AI security (T1117, C8): traveller and client-sent text is scrubbed and
// fenced as data, the security rules ride in systemInstruction, and every
// answer (fresh or cached) passes the shape and text check before it is sent.
import {
  LIMITS, guardPlanInput, guardPlanOutput, guardPlanPayload, makeNonce, systemRules,
} from '../_shared/aiGuard.mjs';
// Model access (T1137, E3): the provider, the chain, the time budget, retries
// and the refusal shape. A provider or model switch is an AI_PLAN_DAY_* value.
import {
  modelAccess, callModel, chainKey, supportsSearch, parseModelJson, refusalBody,
} from '../_shared/aiModels.mjs';
// The prompt and the response schema, from the prompt registry (T1140, E5).
import { LANG_NAMES, RESPONSE_SCHEMA, buildPrompt } from './prompt.mjs';

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

/** "08:00" to minutes past midnight, or null when there was no answer. */
function startMinFrom(hhmm: unknown): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'method' });

  // Provider and ordered models from config (aiModels). Each Gemini model has
  // its own free daily budget, so exhausting the first is a reason to step
  // down a rung, not to fail the request.
  const envGet = (k: string) => Deno.env.get(k);
  const access = modelAccess('plan-day', envGet);
  const GLOBAL_CAP = Number(Deno.env.get('AI_GLOBAL_DAILY_CAP')) || 200;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (access.refusal) return json(access.refusal.status, refusalBody(access.refusal));

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
  try { body = await readJson(req, MAX_BODY); } catch (e) { const p = bodyProblem(e); return json(p.status, { code: p.code }); }

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
  let freeText = cleanText(String(body.freeText ?? ''), 280);
  const lang = LANG_NAMES[String(body.lang)] ? String(body.lang) : 'en';
  const stay = body.stay && Number.isFinite(Number((body.stay as Record<string, unknown>).lat))
    ? { lat: Number((body.stay as Record<string, unknown>).lat), lon: Number((body.stay as Record<string, unknown>).lon) }
    : null;
  let candidates = sanitizeCandidates(body.candidates);
  // Refine loop: the traveller saw a plan and asked for a change. prevStops
  // are names only, so a tampered payload can never inject coordinates.
  let refine = cleanText(String(body.refine ?? ''), 280);
  let prevStops = Array.isArray(body.prevStops)
    ? (body.prevStops as unknown[]).slice(0, 12).map((s) => cleanText(String(s), 90)).filter(Boolean)
    : [];
  const wantEvents = !!body.wantEvents;
  // T433: the days one plan covers. One credit buys them all.
  const days = Math.max(1, Math.min(7, Math.round(Number(body.days)) || 1));
  // The chat planner's structured answers. Whitelisted field by field: this
  // text goes straight into the prompt, so nothing arbitrary may ride along.
  const rawProfile = (body.profile || null) as Record<string, unknown> | null;
  const oneOf = (v: unknown, allowed: string[]) => (allowed.includes(String(v)) ? String(v) : null);
  const profile = rawProfile ? {
    companions: oneOf(rawProfile.companions, ['solo', 'partner', 'friends', 'family', 'group']),
    // "08:00", and nothing else: this string is printed into the prompt.
    startTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(rawProfile.startTime ?? ''))
      ? String(rawProfile.startTime) : null,
    steps: Number.isFinite(Number(rawProfile.steps))
      ? Math.max(1000, Math.min(40000, Math.round(Number(rawProfile.steps)))) : null,
    known: oneOf(rawProfile.known, ['first', 'again']),
    moods: Array.isArray(rawProfile.moods)
      ? (rawProfile.moods as unknown[]).slice(0, 3)
        .map((i) => oneOf(i, ['sights', 'museums', 'nature', 'beach', 'active', 'food', 'local', 'views', 'shopping', 'nightlife']))
        .filter(Boolean)
      : [],
    maxWalkKm: Number.isFinite(Number(rawProfile.maxWalkKm))
      ? Math.max(1, Math.min(40, Math.round(Number(rawProfile.maxWalkKm)))) : null,
    avoidHills: !!rawProfile.avoidHills,
    transitOk: !!rawProfile.transitOk,
    window: oneOf(rawProfile.window, ['morning', 'afternoon', 'full', 'evening']),
    food: oneOf(rawProfile.food, ['sit', 'quick', 'picnic', 'none']),
    diet: Array.isArray(rawProfile.diet)
      ? (rawProfile.diet as unknown[]).slice(0, 5)
        .map((i) => oneOf(i, ['veg', 'vegan', 'gf', 'cheap', 'treat']))
        .filter(Boolean)
      : [],
    avoidCrowds: !!rawProfile.avoidCrowds,
    indoor: !!rawProfile.indoor,
    stepFree: !!rawProfile.stepFree,
    weather: rawProfile.weather && typeof rawProfile.weather === 'object'
      ? {
        rain: !!(rawProfile.weather as Record<string, unknown>).rain,
        hot: !!(rawProfile.weather as Record<string, unknown>).hot,
      }
      : null,
  } : null;
  // Places the traveller named by hand. Names and coordinates only, and any
  // id must match a real candidate: an unchecked id here would let a payload
  // name a stop the deck never offered.
  const candIds = new Set(candidates.map((c) => c.id));
  let mustInclude = Array.isArray(body.mustInclude)
    ? (body.mustInclude as unknown[]).slice(0, 8).map((raw) => {
      const m = (raw || {}) as Record<string, unknown>;
      const name = cleanText(String(m.name ?? ''), 90);
      if (!name) return null;
      const id = candIds.has(String(m.id)) ? String(m.id) : null;
      const lat = Number(m.lat);
      const lon = Number(m.lon);
      return {
        name,
        id,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        timeOfDay: oneOf(m.timeOfDay, ['morning', 'afternoon', 'evening']),
      };
    }).filter(Boolean) as { name: string; id: string | null; lat: number | null; lon: number | null; timeOfDay: string | null }[]
    : [];
  // ---- AI security: every text the prompt prints, scrubbed (T1117) ----
  // Before the cache key and the quota, so an injection spends nothing and
  // cannot share a cache row with a clean request.
  const inGuard = guardPlanInput({ city, country, freeText, refine, prevStops, mustInclude, candidates });
  ({ freeText, refine, prevStops, mustInclude, candidates } = inGuard);
  if (inGuard.badDest) return json(400, { code: 'bad_dest' });
  if (!destId || !city || !Number.isFinite(centreLat) || !Number.isFinite(centreLon)) {
    return json(400, { code: 'bad_dest' });
  }
  if (candidates.length < 3) return json(400, { code: 'too_few' });

  // ---- prompt trim (unit economics Lever 3) ----
  // Send Gemini the top 30 candidates by rating and proximity to the day's
  // centroid instead of the full deck, and strip desc from everything that
  // is not guaranteed a place. The model sequences a shortlist out of the
  // full deck either way (the RESPONSE_SCHEMA still limits a day to about 10
  // stops), so this changes token cost, not the plan a traveller receives.
  // mustSee candidates and every place the traveller named by hand
  // (mustInclude) are exempt from the cut: selectCandidates keeps them
  // whole regardless of rank, so a named place can never be trimmed away.
  //
  // PROMPT_TRIM=false is the shadow-mode escape hatch for a live A/B: it
  // restores the untrimmed candidate list so a side-by-side of trimmed vs
  // full-deck plans can be run on real traffic once this is deployed. See
  // the report for the exact procedure; this session could not run that
  // A/B itself (no deploy rights, no live traffic).
  const promptTrimEnabled = (Deno.env.get('PROMPT_TRIM') || '').toLowerCase() !== 'false';
  const centroid = dayCentroid(candidates, stay);
  const promptCandidates = promptTrimEnabled
    ? selectCandidates(candidates, centroid, {
      // A day needs about thirty to choose from; each further day a dozen more.
      limit: 30 + 12 * (days - 1),
      keepIds: mustInclude.map((m) => m.id).filter((id): id is string => !!id),
    })
    : candidates;

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
  // T433: a change to a plan already paid for is free, twice. The proof is
  // the signed token the last answer carried (see signRefineToken).
  let freeRefine = false;
  let refineN = 0;
  let tokenKey = '';
  if (refine && typeof body.refineToken === 'string') {
    const v = await verifyRefineToken(body.refineToken, SERVICE_KEY, user.id);
    if (v.ok && v.n < REFINES_FREE) { freeRefine = true; refineN = v.n + 1; tokenKey = v.k; }
  }
  const quota = freeRefine
    ? { ok: true, status: 'free_refine', tier: null, left: null, cap: null, used: null }
    : await consume(service, user.id, 'plan', GLOBAL_CAP);
  if (quota.status === 'quota_check') return json(503, { code: 'quota_check' });
  if (!quota.ok) {
    // Count the refusal before answering it. Nothing else records that this
    // request happened: the ledger only ever grows on a grant, so without
    // this row a day where fifty people were turned away is indistinguishable
    // from a quiet day. Not awaited, see logCapRejection.
    logCapRejection(service, quota.status, 'plan', quota.tier);
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
  //
  // Keyed on promptCandidates (the TRIMMED deck), not the full candidates
  // list. This is a deliberate choice, not an oversight, and it only holds
  // because selectCandidates is deterministic: the same full deck, the same
  // centroid and the same mustInclude ids always trim to the same 30 (or
  // fewer) ids in the same order-independent set, so two requests that would
  // send Gemini an identical trimmed deck are in fact asking the identical
  // question and must share a cache row. Keying on the full deck instead
  // would fork the cache on candidates the model never even saw: two
  // travellers whose top-30 trims are identical but whose untrimmed decks
  // differ (a different-sized city, a different exclusion set upstream)
  // would needlessly pay for two generations of the same plan. Keying on the
  // trim is only correct because the trim is provably lossless in exactly
  // the way T039's cache-key normalisation already establishes the rule for:
  // a distinction may leave the key only when nothing downstream can see it,
  // and nothing downstream of this point ever sees the untrimmed deck again.
  const hash = await sha256Hex(cacheKeyInput({
    model: chainKey(access.cfg), destId, month, dateISO, groupSize, pace, vibe, avoidHills,
    freeText, lang, candidates: promptCandidates, refine, prevStopIds: prevStops, wantEvents,
    profile, mustInclude, days,
  }));
  // The next refine token: the same plan, one more free change spent.
  const nextToken = async () => ({
    refineToken: await signRefineToken({ u: user.id, k: tokenKey || hash, n: refineN }, SERVICE_KEY),
    refinesLeft: Math.max(0, REFINES_FREE - refineN),
  });
  const { data: cached } = await service
    .from('ai_plan_cache')
    .select('payload, created_at')
    .eq('hash', hash)
    .maybeSingle();
  const isHit = !!cached?.payload
    && Date.now() - Date.parse(cached.created_at) < 7 * 86400_000;

  // Record the lookup either way. A hit rate needs both numbers, and a miss
  // has no cache row to count against, so the event is written here rather
  // than as a counter on ai_plan_cache. Best-effort: a failed insert must
  // never fail the traveller's request, and the rate is telemetry, not a
  // product rule. A stale row that fell outside the freshness window counts
  // as a MISS, because that is what it cost us.
  //
  // The key version rides along so the effect of a key change can be read
  // straight off admin_ai_cache_report's byVersion without anyone having to
  // remember when the function was redeployed.
  //
  // No await: the response should not wait on telemetry.
  service.from('ai_cache_events').insert({
    hit: isHit,
    dest_id: destId,
    key_version: CACHE_KEY_VERSION,
  }).then(() => {}, () => {});

  // A cached row passes the same payload check as a fresh answer; one that
  // fails it (off-schema, or written before the guard) is a miss.
  const cachedSafe = isHit ? guardPlanPayload(cached.payload) : null;
  if (cachedSafe) {
    return json(200, {
      ...cachedSafe,
      meta: { ...cachedSafe.meta, cached: true, freeRefine },
      pass: { tier: quota.tier, plansLeft: quota.left ?? null },
      ...(await nextToken()),
    });
  }

  // Everything spent from here on has to be returned if the day never gets
  // built. Quota is now a thing travellers PAY for, so an outage on our side
  // must not quietly cost them a generation.
  const spent: string[] = freeRefine ? [] : ['plan'];
  const failed = async (status: number, body: Record<string, unknown>) => {
    for (const kind of spent) await refund(service, user.id, kind);
    return json(status, body);
  };

  // ---- the one AI call: plain generateContent, no tools, low temperature ----
  const nonce = makeNonce();
  const security = systemRules(nonce);
  const prompt = buildPrompt({
    city, country, dateISO, month, groupSize, pace, vibe, avoidHills, freeText, lang,
    hasStay: !!stay, candidates: promptCandidates, wantEvents, refine, prevStops, profile, mustInclude, days, nonce,
  });
  if (prompt.length > LIMITS.planPromptChars) return await failed(400, { code: 'too_big' });
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
  // Live search needs a provider that has it (only Gemini today): another
  // provider is the same as grounding switched off.
  const groundingEnabled = (Deno.env.get('AI_ENABLE_GROUNDING') || '').toLowerCase() !== 'false'
    && supportsSearch(access.cfg);
  let groundingSkipped: string | null = null;
  let useGrounding = false;
  if (wantEvents) {
    if (!groundingEnabled) {
      groundingSkipped = 'off';
    } else {
      const g = await consume(service, user.id, 'ground', GLOBAL_CAP);
      if (g.ok) { useGrounding = true; spent.push('ground'); }
      else {
        groundingSkipped = g.tier === 'free' ? 'tier' : 'cap';
        // A free tier has a zero grounded allowance by design, so that is not
        // a refusal worth counting; it is the tier working. A paid tier out of
        // grounded units is, because grounded is the surface that costs money
        // and running out of it is the signal the allowance is priced wrong.
        if (groundingSkipped === 'cap') {
          logCapRejection(service, g.status, 'ground', g.tier);
        }
      }
    }
  }
  // The one AI call, through aiModels: one time budget for the whole chain
  // (T415), a 429 or 404 steps down a rung, a 5xx is retried once, a timeout
  // falls over while budget is left. A trailing 429 everywhere is global_cap
  // (the "come back tomorrow" copy), no answer in time is ai_timeout.
  const ai = await callModel({
    feature: 'plan-day',
    env: envGet,
    system: security,
    user: prompt,
    json: true,
    schema: RESPONSE_SCHEMA,
    search: useGrounding,
    temperature: refine ? 0.45 : 0.25, // a revision must actually differ
    // gemini-flash-latest is a thinking model and its thoughts spend this
    // budget, so a full day of stops can truncate at 4096. Headroom costs
    // nothing, only generated tokens are billed.
    maxOutputTokens: 8192,
  });
  if (!ai.ok) return await failed(ai.status, refusalBody(ai));
  const aiText: string = ai.text;
  const usedModel: string = ai.model;

  if (aiText.length > LIMITS.modelOutputChars) return await failed(502, { code: 'ai_bad_output' });
  const raw: unknown = parseModelJson(aiText);
  if (raw === undefined) return await failed(502, { code: 'ai_bad_output' });
  // ---- AI security: the shape and text check, before anything reads the answer ----
  const outGuard = guardPlanOutput(raw, { systemText: `${security}\n${prompt}` });
  if (!outGuard.value) return await failed(502, { code: 'ai_bad_output' });
  const parsed: { summary?: unknown; stops?: unknown } = outGuard.value;

  // ---- server-side truth pass: validate stops, then re-time the day ----
  // Validated against promptCandidates, the deck the model actually saw, not
  // the full candidates list: an id that is real but was trimmed away before
  // the prompt was built is exactly as unearned as a hallucinated one, and
  // must be dropped the same way rather than silently let through because it
  // happens to exist somewhere in the untrimmed deck.
  const centre = { lat: centreLat, lon: centreLon };
  const { stops: allStops, dropped } = sanitizeAiStops(parsed.stops, promptCandidates, centre, {
    maxStops: Math.min(40, 10 * days),
  });
  // T433: only catalogue places become stops. An event the model suggested
  // is listed beside the day for the traveller to check; anything else it
  // added from memory is dropped, never routed.
  const safeStops = allStops.filter((s: { external?: boolean }) => !s.external);
  const events = allStops
    .filter((s: { external?: boolean; isEvent?: boolean; name?: string }) => s.external && s.isEvent && s.name)
    .slice(0, 2)
    .map((s: { name: string; why?: string }) => ({ name: s.name, why: s.why || '' }));
  if (safeStops.length < 2) return await failed(502, { code: 'ai_bad_output' });
  // The traveller's own walking answer is ENFORCED here, not merely asked of
  // the model above: the prompt line is a request, this is the guarantee.
  // Several days are cut and ordered by the app, so the one-day walking cut
  // (which would drop the places that belong on another day) does not apply.
  const sched = days > 1 ? {
    stops: safeStops.map((s: Record<string, unknown>) => ({ ...s, arrive: null, walkKmFromPrev: 0, walkMinFromPrev: 0 })),
    totalKm: 0, endTime: null, lunchAfter: -1, lunchMin: 0, optimized: false, farDropped: 0, fromStay: false,
  } : scheduleDay(safeStops, {
    stay, groupSize, maxWalkKm: profile?.maxWalkKm ?? undefined,
    // The traveller's chosen start is enforced here too: asking the model to
    // begin at 11:00 and then re-timing the day from 09:30 would hand back a
    // schedule that contradicts the answer they gave.
    dayStartMin: startMinFrom(profile?.startTime) ?? undefined,
  });
  // Nothing here forms a walkable cluster (a deck whose good places are
  // scattered across the whole 20 km radius). That is not a malformed AI
  // answer, it is a city that cannot give this traveller a walking day, which
  // is exactly what `too_few` already tells them while offering the built-in
  // planner. A one-stop "route" would be worse than saying so.
  if (days === 1 && sched.stops.filter((s: { arrive?: string | null }) => s.arrive).length < 2) {
    return await failed(400, { code: 'too_few' });
  }

  const built = {
    summary: cleanText(String(parsed.summary ?? ''), 400),
    stops: sched.stops,
    events,
    days,
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
      fellBack: ai.fellBack,
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
      freeRefine,
      // What the AI guard did (T1117): input fields it scrubbed, output stops
      // it dropped for their shape, fields it repaired. Counts and names only.
      guard: { input: inGuard.flags, dropped: outGuard.dropped, repaired: outGuard.repaired },
    },
  };
  // The payload check every path runs (the cache path above runs it too).
  const payload = guardPlanPayload(built);
  if (!payload) return await failed(502, { code: 'ai_bad_output' });

  // Cache best-effort: a failed insert must never fail the response.
  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: usedModel }); } catch { /* ignore */ }

  // Log model event for every successful generation: best-effort, never fails
  // the response. This records which model produced the answer, enabling the
  // admin panel to show the model distribution per day and compute the
  // fallback rate as (fallbacks / total) per day.
  const kindUsed = useGrounding ? 'ground' : 'plan';
  const fellBack = ai.fellBack;
  // Not awaited (T300-r): the response must not wait on telemetry. The helper
  // hands the promise to EdgeRuntime.waitUntil so the insert still completes.
  const edge = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  logModelEvent(service, {
    user_id: user.id,
    model: usedModel,
    kind: kindUsed,
    fell_back: fellBack,
  }, edge?.waitUntil ? (p: Promise<unknown>) => edge.waitUntil!(p) : undefined);

  // Entitlement facts ride OUTSIDE payload so they never reach the cache: the
  // cached row is shared between users, and one traveller's remaining balance
  // must not be served to the next.
  return json(200, {
    ...payload,
    pass: { tier: quota.tier, plansLeft: quota.left ?? null },
    ...(await nextToken()),
  });
}, { methods: 'POST, OPTIONS', extraOrigins: () => Deno.env.get('ALLOWED_ORIGINS') || '' }));
