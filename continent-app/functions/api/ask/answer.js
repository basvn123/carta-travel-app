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
 *     the app keeps its facts answer. Without the ASK binding the Function
 *     refuses to call the model at all (503 nocap), so an account on Workers
 *     Paid can never be billed for overage by a missing counter.
 *   - The same pack answered once is cached in KV for a week, so a popular
 *     question costs nothing after the first time.
 *   - At most RATE answers a minute per address, per isolate (best effort).
 *
 * Pages does not apply public/_headers to a Function's response, so the
 * headers are set here.
 */
import {
  readWirePack, packKey, systemPrompt, userPrompt, MAX_ANSWER_TOKENS,
} from '../../../src/lib/ask/context.js';

/** The free allowance is 10,000 Neurons a day (00:00 UTC); stop well short. */
export const CAP = 9000;
const CACHE_TTL = 7 * 24 * 3600;
const RATE = 8;
// Neurons per million tokens, Workers AI pricing (2026-10); in, out.
export const MODELS = [
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', in: 4625, out: 30475 },
  { id: '@cf/meta/llama-3.2-3b-instruct', in: 4625, out: 30475 },
];

const seen = new Map();
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

function limited(ip) {
  const now = Date.now();
  const list = (seen.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  seen.set(ip, list);
  if (seen.size > 5000) seen.clear();
  return list.length > RATE;
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

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.AI) return fail(503, 'off');
  if (!env.ASK) return fail(503, 'nocap');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 8192) return fail(413, 'size');
  let wire;
  try { wire = readWirePack(JSON.parse(await request.text())); } catch { wire = null; }
  if (!wire) return fail(400, 'pack');
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  if (limited(ip)) return fail(429, 'rate');

  const key = `a:${await packKey(wire)}`;
  const hit = await env.ASK.get(key);
  if (hit) {
    return new Response(`data: ${JSON.stringify({ t: hit })}\n\nevent: done\ndata: {"cached":true}\n\n`, { headers: HEADERS });
  }

  const system = systemPrompt(wire.lang);
  const user = userPrompt(wire);
  const tin = tokensOf(system) + tokensOf(user);
  const counter = `n:${day()}`;
  const used = Number(await env.ASK.get(counter)) || 0;
  const worst = neurons(MODELS[0], tin, MAX_ANSWER_TOKENS);
  if (used + worst > CAP) return fail(429, 'cap');
  // Book the worst case first, so two answers at once cannot both pass the cap.
  await env.ASK.put(counter, String(used + worst), { expirationTtl: 2 * 86400 });

  let stream = null;
  let model = null;
  for (const m of MODELS) {
    try {
      stream = await env.AI.run(m.id, {
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: MAX_ANSWER_TOKENS,
        temperature: 0.2,
        stream: true,
      });
      model = m;
      break;
    } catch { stream = null; }
  }
  if (!stream) return fail(502, 'model');

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let text = '';
  let buf = '';
  const out = new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const p = pieceOf(line.trim());
        if (p == null) continue;
        text += p;
        ctl.enqueue(enc.encode(`data: ${JSON.stringify({ t: p })}\n\n`));
      }
    },
    flush(ctl) {
      const p = pieceOf(buf.trim());
      if (p != null) { text += p; ctl.enqueue(enc.encode(`data: ${JSON.stringify({ t: p })}\n\n`)); }
      ctl.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify({ cached: false, model: model.id })}\n\n`));
      // Settle the booking at what the answer really took, and keep the answer.
      const real = neurons(model, tin, tokensOf(text));
      waitUntil((async () => {
        const now = Number(await env.ASK.get(counter)) || 0;
        await env.ASK.put(counter, String(Math.max(0, now - worst + real)), { expirationTtl: 2 * 86400 });
        if (text.trim()) await env.ASK.put(key, text, { expirationTtl: CACHE_TTL });
      })());
    },
  });
  return new Response(stream.pipeThrough(out), { headers: HEADERS });
}

