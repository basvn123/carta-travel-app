/**
 * POST /api/ask/answer : the written Ask Carta answer, from an open model on
 * Cloudflare Workers AI (T556). Never the Claude API and no paid key: the
 * models are open-weight ones Workers AI runs on this account, inside the
 * free daily Neurons.
 *
 * The body is the context pack's wire form (src/lib/ask/context.js
 * wirePack: question, numbered notes, language, prompt version), checked
 * by readWirePack before anything runs. The answer streams back as server
 * sent events: `data: {"t": "..."}` per piece, then `event: done`. The
 * browser checks every sentence against the notes (verify.js) before it
 * shows, so this Function only writes.
 *
 * Free, and kept free:
 *   - A daily Neurons counter in KV (binding ASK). Before a call the worst
 *     case is added to the day's count; past CAP the answer is `429 cap` and
 *     the app keeps its facts answer. When every model fails the booking is
 *     handed back. Without the ASK binding the Function
 *     refuses to call the model at all (503 nocap), so an account on Workers
 *     Paid can never be billed for overage by a missing counter.
 *   - The same pack answered once is cached in KV for a week, so a popular
 *     question costs nothing after the first time.
 *   - At most RATE answers a minute per address, per isolate (best effort).
 *
 * AI security (T1117, C8): the question and the notes are fenced as data
 * (aiGuard.askUserPrompt) under the guard's system rules; a question that is
 * itself an injection is refused (400 unsafe) before any Neurons are booked,
 * and a note that carries one is withheld. Every answer, fresh or cached,
 * streams through aiGuard.makeStreamGuard: a sentence with a link, markup,
 * an e-mail or a phone number is dropped, and a prompt leak or a turned
 * model ends the stream. The browser's verify.js and agree.js still check
 * every sentence that reaches it.
 *
 * Model access (T1137, E3): the model is called through aiModels.callModel,
 * the module the Edge Functions use. The provider and the chain are config
 * (AI_ASK_PROVIDER, AI_ASK_MODELS; default Workers AI through the AI binding),
 * with the same time budget, retry and fall-over rules as every AI call.
 *
 * Pages does not apply public/_headers to a Function's response, so the
 * headers are set here.
 */
import {
  readWirePack, packKey, systemPrompt, MAX_ANSWER_TOKENS,
} from '../../../src/lib/ask/context.js';
import {
  GUARD_VERSION, guardAskInput, askUserPrompt, systemRules, makeNonce, makeStreamGuard,
} from '../../_lib/aiGuard.js';
import { createLimiter, overLimit, methodNotAllowed } from '../../_lib/guard.js';
import { AI_FEATURES, modelAccess, callModel, neuronPrice } from '../../_lib/aiModels.js';
import { hashQuery } from '../../_lib/aiEvents.mjs';

/** The free allowance is 10,000 Neurons a day (00:00 UTC); stop well short. */
export const CAP = 9000;
const CACHE_TTL = 7 * 24 * 3600;
const RATE = 8;
const MAX_BODY = 8192;
// The default chain with its Neurons per million tokens (aiModels.NEURON_PRICES); in, out.
export const MODELS = AI_FEATURES.ask.models.map((id) => ({ id, ...neuronPrice(id) }));

// Per-isolate window, plus the RATE_LIMIT binding when the account has one (T1079).
const limiter = createLimiter({ max: RATE });
const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const day = () => new Date().toISOString().slice(0, 10);
const tokensOf = (s) => Math.ceil(String(s).length / 3.5);
export const neurons = (m, tin, tout) => Math.ceil((tin * m.in + tout * m.out) / 1e6);

function fail(status, reason) {
  return new Response(`event: error\ndata: ${JSON.stringify({ reason })}\n\n`, { status, headers: HEADERS });
}

/** One piece of text out of a Workers AI stream line (two shapes exist). */
export function pieceOf(line) {
  if (!line.startsWith('data:')) return null;
  const raw = line.slice(5).trim();
  if (!raw || raw === '[DONE]') return null;
  try {
    const j = JSON.parse(raw);
    const v = j.response ?? j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? null;
    // A lone digit can arrive as a JSON number ({"response": 0}): keep it as
    // text, and never test a piece for truth, or every "0" is lost ("80" -> "8").
    return v == null || v === '' ? null : String(v);
  } catch { return null; }
}

export const onRequest = () => methodNotAllowed('POST');

export async function onRequestPost({ request, env, waitUntil }) {
  const access = modelAccess('ask', env, env.AI);
  if (access.refusal) return fail(503, 'off');
  if (!env.ASK) return fail(503, 'nocap');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return fail(413, 'size');
  let raw;
  try { raw = await request.text(); } catch { raw = null; }
  // content-length can be missing or false (chunked bodies): measure what arrived.
  if (raw != null && raw.length > MAX_BODY) return fail(413, 'size');
  let wire;
  try { wire = readWirePack(JSON.parse(raw)); } catch { wire = null; }
  if (!wire) return fail(400, 'pack');
  if (await overLimit(env, request, limiter, 'answer')) return fail(429, 'rate');
  const input = guardAskInput(wire);
  if (!input.ok) return fail(400, 'unsafe');

  const nonce = makeNonce();
  const system = `${systemPrompt(wire.lang)}\n${systemRules(nonce)}`;
  // The guard version is in the key: an answer cached before a guard change is not served.
  const key = `a:g${GUARD_VERSION}:${await packKey(wire)}`;
  const hit = await env.ASK.get(key);
  if (hit) {
    // A cached answer passes the same output guard as a fresh one.
    const g = makeStreamGuard({ systemText: system });
    const safe = g.push(hit) + g.end();
    const body = (safe ? `data: ${JSON.stringify({ t: safe })}\n\n` : '')
      + `event: done\ndata: ${JSON.stringify({ cached: true, ...(g.state.withdrawn ? { guard: 'withdrawn' } : {}) })}\n\n`;
    return new Response(body, { headers: HEADERS });
  }

  const user = askUserPrompt(input, nonce);
  const tin = tokensOf(system) + tokensOf(user);
  const counter = `n:${day()}`;
  const used = Number(await env.ASK.get(counter)) || 0;
  const worst = neurons(neuronPrice(access.cfg.models[0]), tin, MAX_ANSWER_TOKENS);
  if (used + worst > CAP) return fail(429, 'cap');
  // Book the worst case first, so two answers at once cannot both pass the cap.
  await env.ASK.put(counter, String(used + worst), { expirationTtl: 2 * 86400 });

  const ai = await callModel({
    feature: 'ask', env, binding: env.AI, system, user,
    // The event keeps a salted hash of the question, never its text (T1139, E4).
    queryHash: await hashQuery(input.question, env.AI_EVENTS_SALT || 'carta-ask'), waitUntil,
    stream: true, temperature: 0.2, maxOutputTokens: MAX_ANSWER_TOKENS,
  });
  // Every model's budget spent reads as the cap (the app keeps its facts answer).
  // No model wrote anything, so the booking is handed back (T1206, T1137-f):
  // a run of failures must not eat the day's Neurons.
  if (!ai.ok) {
    const now = Number(await env.ASK.get(counter)) || 0;
    await env.ASK.put(counter, String(Math.max(0, now - worst)), { expirationTtl: 2 * 86400 });
  }
  if (!ai.ok) return fail(ai.status, ai.code === 'global_cap' ? 'cap' : ai.code === 'no_ai' || ai.code === 'config' ? 'off' : 'model');
  const stream = ai.stream;
  const model = { id: ai.model, ...neuronPrice(ai.model) };

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let text = '';
  let shown = '';
  let buf = '';
  const guard = makeStreamGuard({ systemText: system });
  const send = (ctl, safe) => {
    if (!safe) return;
    shown += safe;
    ctl.enqueue(enc.encode(`data: ${JSON.stringify({ t: safe })}\n\n`));
  };
  const out = new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const p = pieceOf(line.trim());
        if (p == null) continue;
        text += p;
        send(ctl, guard.push(p));
      }
    },
    flush(ctl) {
      const p = pieceOf(buf.trim());
      if (p != null) { text += p; send(ctl, guard.push(p)); }
      send(ctl, guard.end());
      const { withdrawn, dropped } = guard.state;
      ctl.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify({
        cached: false, model: model.id, ...(withdrawn || dropped ? { guard: withdrawn ? 'withdrawn' : 'dropped' } : {}),
      })}\n\n`));
      // Settle the booking at what the answer really took (all of it, shown
      // or not), and keep only what the guard let out.
      const real = neurons(model, tin, tokensOf(text));
      waitUntil((async () => {
        const now = Number(await env.ASK.get(counter)) || 0;
        await env.ASK.put(counter, String(Math.max(0, now - worst + real)), { expirationTtl: 2 * 86400 });
        if (shown.trim() && !withdrawn) await env.ASK.put(key, shown, { expirationTtl: CACHE_TTL });
      })());
    },
  });
  return new Response(stream.pipeThrough(out), { headers: HEADERS });
}

