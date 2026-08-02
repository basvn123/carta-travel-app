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
import { cleanText, modelChain, shouldFallOver } from '../plan-day/logic.mjs';
import {
  sanitizeFiles, sanitizeTripContext, sanitizeParsed, cacheKeyInput,
  safeFetchUrl, htmlToText,
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

// Structured output: malformed JSON impossible, unknown keys unrepresentable.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'One sentence: what the documents contained.' },
    bookings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', description: 'flight_out | flight_home | flight | stay | car | transfer | activity | other' },
          title: { type: 'STRING', description: 'Short human label, e.g. "Ryanair CRL to PMO" or "Hotel Miramare".' },
          city: { type: 'STRING', description: 'The trip city this belongs to, when clear.' },
          code: { type: 'STRING', description: 'Confirmation / PNR / reference code exactly as printed.' },
          eur: { type: 'NUMBER', description: 'Total paid in euros; convert approximately when printed in another currency.' },
          amount: { type: 'NUMBER', description: 'Total exactly as printed, when not in euros.' },
          currency: { type: 'STRING', description: 'ISO 4217 code of the printed amount, when not EUR.' },
          link: { type: 'STRING', description: 'A manage-booking URL printed in the document. Never construct one.' },
          date: { type: 'STRING', description: 'YYYY-MM-DD the booking is for, when printed.' },
        },
        required: ['kind', 'title'],
      },
    },
    activities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          city: { type: 'STRING' },
          eur: { type: 'NUMBER', description: 'Cost per person in euros, when stated.' },
          durationMin: { type: 'INTEGER', description: 'Typical duration in minutes, when stated or obvious.' },
          note: { type: 'STRING', description: 'One short sentence of useful context from the document.' },
          day: { type: 'INTEGER', description: 'Trip day number this best fits, ONLY when the dates make it clear.' },
        },
        required: ['name'],
      },
    },
  },
  required: ['summary', 'bookings', 'activities'],
};

function buildPrompt(p: {
  context: ReturnType<typeof sanitizeTripContext>; lang: string; hasFiles: boolean; text: string;
}) {
  const langName = LANG_NAMES[p.lang] || 'English';
  const stops = p.context.stops.map((s, i) => (
    `${i + 1}. ${s.city}${s.country ? `, ${s.country}` : ''}${s.arrive ? `, arriving ${s.arrive}` : ''}, ${s.nights} night(s), trip days ${s.firstDay}-${s.lastDay}`
  ));
  return [
    "You are Carta's booking reader: you turn a traveller's own documents (booking confirmations, tickets, itineraries, activity guides) into structured facts for their trip plan.",
    '',
    'THE TRIP THESE DOCUMENTS BELONG TO:',
    `- Party of ${p.context.groupSize}.`,
    ...(stops.length ? stops : ['- (no stops known yet)']),
    '',
    'RULES:',
    '- Report ONLY what the documents actually contain. Never invent a code, a price, a URL or a date. Omit any field the documents do not state.',
    '- bookings: one entry per actual reservation. kind: flight_out for the outbound flight of this trip, flight_home for the flight home, flight when unclear which; stay for accommodation; car for a rental car; transfer for a booked train, bus or ferry between cities; activity for a booked tour, ticket or restaurant; other otherwise.',
    '- eur is the TOTAL paid for the whole party. When the document prints another currency, also return amount and currency exactly as printed and convert eur approximately.',
    '- activities: things the documents suggest DOING that are not firm reservations (items from an itinerary, tips from a guide, optional tours). Give day only when the printed dates line up with the trip days above.',
    '- NEVER include traveller names, email addresses, phone numbers or street addresses in any field.',
    `- Write note, title and summary in ${langName}. Keep them short and concrete.`,
    '- Never use em dashes or en dashes in any text.',
    p.text ? `\nPASTED TEXT FROM THE TRAVELLER:\n${p.text}` : '',
    p.hasFiles ? '\nThe uploaded documents follow.' : '',
  ].filter(Boolean).join('\n');
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { code: 'method' });

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
  const CHAIN = modelChain(Deno.env.get('GEMINI_MODEL'), Deno.env.get('GEMINI_MODELS'));
  const GLOBAL_CAP = Number(Deno.env.get('AI_GLOBAL_DAILY_CAP')) || 200;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!GEMINI_API_KEY) return json(503, { code: 'no_ai' });

  // Personal documents spend personal quota: a real signed-in user only.
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
  const files = sanitizeFiles(body.files);
  const pastedText = cleanText(String(body.text ?? ''), 20000);
  const context = sanitizeTripContext(body.context);
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
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'CartaTravel/1.0 (booking import)', Accept: 'text/html, application/pdf, text/plain' },
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
      });
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

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- quota gate: same allowance as a bot day plan (see header) ----
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

  // ---- cache: a free retry, not long-term storage (24h, see header) ----
  // URL content rides inside `text`, so the key is content-addressed: the
  // same article parses once, an updated one earns a fresh generation.
  const combinedText = [pastedText, urlText].filter(Boolean).join('\n\n').slice(0, 40000);
  const fileHashes = await Promise.all(files.map((f) => sha256Hex(f.data)));
  const hash = await sha256Hex(cacheKeyInput({
    model: CHAIN.join(','), fileHashes, text: combinedText, context, lang,
  }));
  const { data: cached } = await service
    .from('ai_plan_cache')
    .select('payload, created_at')
    .eq('hash', hash)
    .maybeSingle();
  if (cached?.payload && Date.now() - Date.parse(cached.created_at) < 86400_000) {
    return json(200, {
      ...cached.payload,
      meta: { ...cached.payload.meta, cached: true },
      pass: { tier: quota.tier, plansLeft: quota.left ?? null },
    });
  }

  const failed = async (status: number, body: Record<string, unknown>) => {
    await refund(service, user.id, 'plan');
    return json(status, body);
  };

  // ---- the one AI call: documents inline, structured output, no tools ----
  const textFiles = files.filter((f) => f.mime === 'text/plain');
  const docFiles = files.filter((f) => f.mime !== 'text/plain');
  const extraText = textFiles.map((f) => decodeTextFile(f.data)).filter(Boolean)
    .map((t) => cleanText(t, 20000)).join('\n\n');
  const prompt = buildPrompt({
    context, lang, hasFiles: docFiles.length > 0,
    text: [combinedText, extraText].filter(Boolean).join('\n\n').slice(0, 60000),
  });
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const f of docFiles) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });

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
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.1, // extraction wants fidelity, not flair
              // gemini-flash-latest is a thinking model and its thoughts spend
              // this budget (see plan-day); headroom itself costs nothing.
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch {
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

  let parsed: unknown;
  try { parsed = JSON.parse(aiText); } catch { return await failed(502, { code: 'ai_bad_output' }); }

  // ---- server-side truth pass ----
  const safe = sanitizeParsed(parsed, { totalDays: context.totalDays || 60 });
  if (!safe.bookings.length && !safe.activities.length) {
    // The model read the documents and found no trip facts in them. That is
    // an answer, not an error; the client says "nothing recognisable".
    return await failed(200, { code: 'nothing_found', summary: safe.summary });
  }

  const payload = {
    ...safe,
    meta: {
      model: usedModel,
      fellBack: usedModel !== CHAIN[0],
      files: files.length,
      cached: false,
    },
  };

  try { await service.from('ai_plan_cache').upsert({ hash, payload, model: usedModel }); } catch { /* ignore */ }

  return json(200, {
    ...payload,
    pass: { tier: quota.tier, plansLeft: quota.left ?? null },
  });
});
