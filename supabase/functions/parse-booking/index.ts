/**
 * parse-booking, the "magic import" Edge Function.
 *
 * The traveller drops their own booking confirmations (PDF, photo, plain
 * text) on a planned trip; this function shows the documents to Gemini once,
 * with the trip's stops and dates as context, and returns two structured
 * lists: bookings (confirmation code, paid total, printed link) that the
 * client folds into the trip's booking rows, and activities (things the
 * documents say they will do) that land in the Activity Inbox for day
 * assignment. Everything the model returns is re-validated in logic.mjs,
 * and everything the client sends is whitelisted there first: an uploaded
 * document is untrusted input in BOTH directions.
 *
 * Facts only travel one way: the model may only report what is printed in
 * the documents (the prompt forbids invented codes, prices and links, and
 * sanitizeParsed drops anything that is not a real URL or a real number).
 * Traveller names and contact details are explicitly excluded from the
 * output, because the extras store syncs to the account and the response
 * cache is shared infrastructure.
 *
 * Billing posture: identical to plan-day (see its header). One import spends
 * one unit of the same 'plan' allowance a bot day costs: it is the same
 * magnitude of AI work, and reusing the kind means no new migration and no
 * second cap to tune. No grounding here, ever: the documents are the ground.
 *
 * Cache: same generic ai_plan_cache table, keyed on the file hashes + trip
 * context, read with a 24 HOUR validity rather than plan-day's 7 days. The
 * payload contains booking codes extracted from personal documents; a short
 * TTL keeps the cache what it is meant to be (a free retry after a network
 * blip) without becoming long-term storage of personal data.
 *
 * Secrets (set via `supabase secrets set`): GEMINI_API_KEY, and optionally
 * GEMINI_MODEL / GEMINI_MODELS, AI_GLOBAL_DAILY_CAP (200).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanText } from '../plan-day/logic.mjs';
// Model access (T1137, E3): provider, chain, time budget, retries and the
// refusal shape. A switch is an AI_PARSE_BOOKING_* value, not a code change.
import { modelAccess, callModel, chainKey, parseModelJson, refusalBody } from '../_shared/aiModels.mjs';
import {
  sanitizeFiles, sanitizeTripContext, sanitizeParsed, cacheKeyInput,
  safeFetchUrl, htmlToText,
} from './logic.mjs';
import { fetchPublic } from './fetchGuard.mjs';
import { consume, logCapRejection, refund } from '../_shared/passes.mjs';
// The prompt and the response schema, from the prompt registry (T1140, E5).
import { LANG_NAMES, RESPONSE_SCHEMA, buildPrompt } from './prompt.mjs';

import { withCors, readJson, bodyProblem } from '../_shared/http.mjs';
// AI security (T1117, C8): pasted, fetched and uploaded text is scrubbed and
// fenced as data, the security rules ride in systemInstruction, and every
// answer (fresh or cached) passes the text check before it is sent.
import {
  LIMITS, guardBookingInput, guardBookingOutput, guardBookingPayload, makeNonce, systemRules,
} from '../_shared/aiGuard.mjs';

// The largest body this function reads (T1079): refused with 413 beyond it.
const MAX_BODY = 9000000;

// Allow-Origin is set per request by withCors (an allow-list, not `*`; T1079).
const CORS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) => new Response(
  JSON.stringify(body),
  { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
);

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A text/plain upload goes into the prompt as text: cheaper than making the
// model OCR its own input format, and base64 text is still base64 to it.
function decodeTextFile(b64: string): string {
  try {
    const bytes = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'method' });

  const envGet = (k: string) => Deno.env.get(k);
  const access = modelAccess('parse-booking', envGet);
  const GLOBAL_CAP = Number(Deno.env.get('AI_GLOBAL_DAILY_CAP')) || 200;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (access.refusal) return json(access.refusal.status, refusalBody(access.refusal));

  // Personal documents spend personal quota: a real signed-in user only.
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
  const files = sanitizeFiles(body.files);
  let pastedText = cleanText(String(body.text ?? ''), 20000);
  let context = sanitizeTripContext(body.context);
  const lang = LANG_NAMES[String(body.lang)] ? String(body.lang) : 'en';
  const url = safeFetchUrl(body.url);
  if (!files.length && !pastedText && !url) return json(400, { code: 'nothing_to_parse' });

  // ---- URL ingestion: fetch the page BEFORE any quota is spent ----
  // The fetch itself costs nothing, so an unreachable link fails free, and
  // the extracted content feeds the cache key so the same article parses
  // once. A link straight to a PDF joins the document files instead.
  let urlText = '';
  if (url) {
    try {
      // Every hop is checked by name AND by resolved address, redirects are
      // followed by hand (at most MAX_REDIRECTS) and each Location runs the
      // whole check again: see fetchGuard.mjs (T1211, T1164-m). Residual
      // risk: fetch() does its own DNS lookup after ours and Deno cannot pin
      // it to the checked address, so a near-zero-TTL rebinding name still
      // has a small time-of-check to time-of-use window.
      const got = await fetchPublic(url, {
        fetch,
        resolveDns: (host: string, type: 'A' | 'AAAA') =>
          Deno.resolveDns(host, type, { signal: AbortSignal.timeout(5_000) }),
        headers: { 'User-Agent': 'CartaTravel/1.0 (booking import)', Accept: 'text/html, application/pdf, text/plain' },
        timeoutMs: 12_000,
      });
      if (!got.response) return json(400, { code: 'url_unreachable' });
      const resp: Response = got.response;
      if (!resp.ok) return json(400, { code: 'url_unreachable', status: resp.status });
      const ctype = (resp.headers.get('content-type') || '').toLowerCase();
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.length > 4 * 1024 * 1024) return json(400, { code: 'url_too_big' });
      if (ctype.includes('application/pdf')) {
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        }
        files.push({ mime: 'application/pdf', data: btoa(bin), name: url.slice(0, 80) });
      } else if (ctype.includes('text/html') || ctype.includes('text/plain') || ctype === '') {
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        urlText = ctype.includes('text/html') ? htmlToText(raw) : cleanText(raw, 20000);
        if (!urlText) return json(400, { code: 'url_empty' });
      } else {
        return json(400, { code: 'url_unreachable' });
      }
    } catch {
      return json(400, { code: 'url_unreachable' });
    }
  }

  // ---- AI security: the texts the prompt prints, scrubbed (T1117) ----
  // Before the cache key: the scrubbed text is the identity of the import.
  const textFiles = files.filter((f) => f.mime === 'text/plain');
  const docFiles = files.filter((f) => f.mime !== 'text/plain');
  const inGuard = guardBookingInput({
    texts: [pastedText, urlText, ...textFiles.map((f) => cleanText(decodeTextFile(f.data), 20000))],
    context,
  });
  const [cleanPasted, cleanUrl, ...cleanFiles] = inGuard.texts;
  pastedText = cleanPasted;
  urlText = cleanUrl;
  context = inGuard.context as typeof context;
  if (!docFiles.length && !pastedText && !urlText && !cleanFiles.some(Boolean)) {
    return json(400, { code: 'nothing_to_parse' });
  }

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- quota gate: same allowance as a bot day plan (see header) ----
  const quota = await consume(service, user.id, 'plan', GLOBAL_CAP);
  if (quota.status === 'quota_check') return json(503, { code: 'quota_check' });
  if (!quota.ok) {
    logCapRejection(service, quota.status, 'plan', quota.tier);
    return json(429, {
      code: quota.status, // 'user_cap' | 'global_cap'
      tier: quota.tier,
      cap: quota.cap ?? 0,
      used: quota.used ?? 0,
    });
  }

  // ---- cache: a free retry, not long-term storage (24h, see header) ----
  // URL content rides inside `text`, so the key is content-addressed: the
  // same article parses once, an updated one earns a fresh generation.
  const combinedText = [pastedText, urlText].filter(Boolean).join('\n\n').slice(0, 40000);
  const fileHashes = await Promise.all(files.map((f) => sha256Hex(f.data)));
  const hash = await sha256Hex(cacheKeyInput({
    model: chainKey(access.cfg), fileHashes, text: combinedText, context, lang,
  }));
  const { data: cached } = await service
    .from('ai_plan_cache')
    .select('payload, created_at')
    .eq('hash', hash)
    .maybeSingle();
  // A cached row passes the same text check as a fresh answer; null is a miss.
  const cachedSafe = cached?.payload && Date.now() - Date.parse(cached.created_at) < 86400_000
    ? guardBookingPayload(cached.payload) : null;
  if (cachedSafe) {
    return json(200, {
      ...cachedSafe,
      meta: { ...cachedSafe.meta, cached: true },
      pass: { tier: quota.tier, plansLeft: quota.left ?? null },
    });
  }

  const failed = async (status: number, body: Record<string, unknown>) => {
    await refund(service, user.id, 'plan');
    return json(status, body);
  };

  // ---- the one AI call: documents inline, structured output, no tools ----
  const extraText = cleanFiles.filter(Boolean).join('\n\n');
  const sourceText = [combinedText, extraText].filter(Boolean).join('\n\n').slice(0, 60000);
  const nonce = makeNonce();
  const security = systemRules(nonce);
  const prompt = buildPrompt({ context, lang, hasFiles: docFiles.length > 0, text: sourceText, nonce });
  if (prompt.length > LIMITS.bookingPromptChars) return await failed(400, { code: 'too_big' });
  const parts: { text?: string; inline?: { mime: string; data: string } }[] = [{ text: prompt }];
  for (const f of docFiles) parts.push({ inline: { mime: f.mime, data: f.data } });

  // Through aiModels: the same budget, retry and fall-over rules as plan-day
  // (before T1137 a timeout here ended the import; now it falls over while
  // the budget lasts).
  const ai = await callModel({
    feature: 'parse-booking',
    env: envGet,
    system: security,
    parts,
    json: true,
    schema: RESPONSE_SCHEMA,
    temperature: 0.1, // extraction wants fidelity, not flair
    // gemini-flash-latest is a thinking model and its thoughts spend this
    // budget (see plan-day); headroom itself costs nothing.
    maxOutputTokens: 8192,
  });
  if (!ai.ok) return await failed(ai.status, refusalBody(ai));
  const aiText: string = ai.text;
  const usedModel: string = ai.model;

  if (aiText.length > LIMITS.modelOutputChars) return await failed(502, { code: 'ai_bad_output', reason: 'too_long' });
  const parsed: unknown = parseModelJson(aiText);
  if (parsed === undefined) return await failed(502, { code: 'ai_bad_output', reason: 'json_parse' });

  // ---- server-side truth pass ----
  const shaped = sanitizeParsed(parsed, { totalDays: context.totalDays || 60 });
  if (shaped.reason) {
    // JSON was valid but had missing required keys or wrong shape.
    return await failed(502, { code: 'ai_bad_output', reason: shaped.reason });
  }
  // ---- AI security: the text check; with text-only input, links and codes must be in it ----
  const { repaired, ...safe } = guardBookingOutput(shaped, {
    sourceText, textOnly: docFiles.length === 0, systemText: `${security}\n${prompt}`,
  });
  if (!safe.bookings.length && !safe.activities.length) {
    // The model read the documents and found no trip facts in them. That is
    // an answer, not an error; the client says "nothing recognisable".
    return await failed(200, { code: 'nothing_found', reason: 'empty_result', summary: safe.summary });
  }

  const payload = {
    ...safe,
    meta: {
      model: usedModel,
      fellBack: ai.fellBack,
      files: files.length,
      cached: false,
      guard: { input: inGuard.flags, repaired },
    },
  };

  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: usedModel }); } catch { /* ignore */ }

  return json(200, {
    ...payload,
    pass: { tier: quota.tier, plansLeft: quota.left ?? null },
  });
}, { methods: 'POST, OPTIONS', extraOrigins: () => Deno.env.get('ALLOWED_ORIGINS') || '' }));
