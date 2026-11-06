/**
 * aiModels: the one model-access module for Carta's AI calls (T1137, ROADMAP
 * E3). Every call to a language model from an Edge Function (plan-day,
 * suggest-city, parse-booking) or from Ask's Pages Function goes through
 * callModel here; nothing else in the code base may name a provider endpoint
 * (continent-app/tests/aiGateway.test.mjs fails on any that does). The
 * pipeline's batch jobs use the Python twin, pipeline/ai_gateway.py, which
 * keeps the same rules.
 *
 * Its partner is aiGuard (the input and output guard, T1117). aiModels does
 * not read or change prompt text: it decides WHICH provider and model answer,
 * HOW LONG each may take, WHEN to retry or fall over, and what a failure
 * looks like to the caller.
 *
 * A byte-identical copy lives at continent-app/functions/_lib/aiModels.js for
 * Ask; aiGateway.test.mjs fails when the two differ. Plain ES module, no Deno
 * or Workers API, so the Node tests run the very code that ships.
 *
 * Config. Each feature has a default entry in AI_FEATURES. The environment
 * overrides it, so a switch of provider or model is a config change, never a
 * code change:
 *   AI_<FEATURE>_PROVIDER   gemini | workers-ai | openai
 *   AI_<FEATURE>_MODELS     comma-separated chain, first model first
 *   AI_<FEATURE>_BASE_URL   openai provider only: an OpenAI-compatible API
 *                           (Scaleway, OVHcloud, Mistral, llama.cpp server)
 * <FEATURE> is the feature name in upper case with - as _ (PLAN_DAY).
 * The older GEMINI_MODELS (replaces the chain) and GEMINI_MODEL (promoted to
 * the front) still apply to the Gemini features. Keys: GEMINI_API_KEY;
 * CF_ACCOUNT_ID and CF_AI_TOKEN for Workers AI outside a Worker binding;
 * AI_OPENAI_API_KEY for the openai provider. The Claude API is refused as
 * a config error (CLAUDE.md: never the Claude API).
 *
 * Failure rules, the same for every feature:
 *   - One time budget per call; the first model gets the larger share
 *     (attemptTimeoutMs). Too little left: stop.
 *   - 429 (that model's budget is spent) and 404 (model retired): next model.
 *     With retry429Ms set (batch jobs), wait once and retry the same model.
 *   - 5xx or a dropped connection: retry the same model once, then next.
 *   - A timeout: next model.
 *   - Any other 4xx is our own bad request: stop.
 *   - An answer longer than maxOutputChars is ai_bad_output.
 * Refusal shape: { ok: false, code, status, reason?, attempts }, where code
 * is one of AI_CODES and status the HTTP status the caller answers with.
 */

export const AI_MODELS_VERSION = 1;

export const PROVIDERS = ['gemini', 'workers-ai', 'openai'];

/** The refusal codes every AI endpoint answers with, and their HTTP status. */
export const AI_CODES = {
  no_ai: 503, // no key or binding for the configured provider
  config: 503, // the config names something this module refuses (an unknown provider, the Claude API)
  unsafe: 400, // the input is an injection (aiGuard)
  too_big: 400, // the prompt is over the feature's cap
  ai_timeout: 504, // no model answered inside the budget
  ai_error: 502, // a provider error that is not a spent budget
  global_cap: 429, // every model in the chain answered 429
  ai_bad_output: 502, // the answer is too long, empty or off-schema
};

/** A refusal in the one shape every caller returns. */
export function aiRefusal(code, extra = {}) {
  const status = AI_CODES[code] ?? 502;
  return { ok: false, code, status, ...extra };
}

/** The JSON body an Edge Function answers a refusal with: { code, status? (the provider's), reason? }. */
export function refusalBody(r) {
  return {
    code: r.code,
    ...(r.upstream ? { status: r.upstream } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
  };
}

// Every Gemini model on the free tier has its own daily budget, so the chain
// multiplies capacity. Order and reasons: plan-day/logic.mjs (T433).
export const GEMINI_CHAIN = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

export const WORKERS_AI_CHAIN = [
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/meta/llama-3.2-3b-instruct',
];

/** Workers AI price, Neurons per million tokens (2026-10): in, out. Unknown models are priced as the dearest known one. */
export const NEURON_PRICES = {
  '@cf/qwen/qwen3-30b-a3b-fp8': { in: 4625, out: 30475 },
  '@cf/meta/llama-3.2-3b-instruct': { in: 4625, out: 30475 },
};

/**
 * Per-feature defaults. budgetMs is the whole call; firstMs and laterMs cap
 * one attempt; minMs is the least worth starting an attempt with. Supabase
 * gives an Edge Function 150 s of wall clock; the budgets stay well inside.
 */
export const AI_FEATURES = {
  ask: {
    provider: 'workers-ai', models: WORKERS_AI_CHAIN,
    budgetMs: 20_000, firstMs: 12_000, laterMs: 8_000, minMs: 3_000, retry429Ms: 0,
    maxPromptChars: 12_000, maxOutputChars: 65_536,
  },
  'plan-day': {
    provider: 'gemini', models: GEMINI_CHAIN,
    budgetMs: 80_000, firstMs: 40_000, laterMs: 25_000, minMs: 8_000, retry429Ms: 0,
    maxPromptChars: 60_000, maxOutputChars: 65_536,
  },
  'suggest-city': {
    provider: 'gemini', models: GEMINI_CHAIN,
    budgetMs: 80_000, firstMs: 45_000, laterMs: 25_000, minMs: 8_000, retry429Ms: 0,
    maxPromptChars: 60_000, maxOutputChars: 65_536,
  },
  'parse-booking': {
    provider: 'gemini', models: GEMINI_CHAIN,
    budgetMs: 90_000, firstMs: 60_000, laterMs: 25_000, minMs: 8_000, retry429Ms: 0,
    maxPromptChars: 80_000, maxOutputChars: 65_536,
  },
  // The offline plan-day judge (T1148, F6): an eval script, never a traveller's call.
  'eval-judge': {
    provider: 'gemini', models: GEMINI_CHAIN,
    budgetMs: 90_000, firstMs: 60_000, laterMs: 25_000, minMs: 8_000, retry429Ms: 0,
    maxPromptChars: 60_000, maxOutputChars: 65_536,
  },
};

const DEFAULT_MODELS = { gemini: GEMINI_CHAIN, 'workers-ai': WORKERS_AI_CHAIN, openai: [] };
const MAX_CHAIN = 6;

const envName = (feature) => `AI_${String(feature).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
const list = (s) => String(s || '').split(',').map((m) => m.trim()).filter(Boolean);
const reader = (env) => (typeof env === 'function' ? env : (k) => (env ? env[k] : undefined));

/**
 * The Gemini chain from the older variables: GEMINI_MODELS replaces it,
 * GEMINI_MODEL is promoted to the front (the fallbacks stay behind it).
 */
export function modelChain(primary, listed, defaults = GEMINI_CHAIN) {
  const l = list(listed);
  if (l.length) return [...new Set(l)].slice(0, MAX_CHAIN);
  return [...new Set([...list(primary), ...defaults])].slice(0, MAX_CHAIN);
}

const FORBIDDEN = /anthropic|claude/i;

/**
 * The resolved config for one feature: { feature, provider, models, baseUrl,
 * ...timings, error }. error is set (and the call refused as `config`) when
 * the feature is unknown, the provider is not one of PROVIDERS, the chain is
 * empty, a base URL is not https, or anything names the Claude API.
 */
export function resolveModelConfig(feature, env = {}) {
  const get = reader(env);
  const base = AI_FEATURES[feature];
  if (!base) return { feature, provider: '', models: [], error: 'unknown_feature' };
  const pre = envName(feature);
  const provider = String(get(`${pre}_PROVIDER`) || base.provider).trim().toLowerCase();
  let models;
  const own = list(get(`${pre}_MODELS`));
  if (own.length) models = [...new Set(own)].slice(0, MAX_CHAIN);
  else if (provider === 'gemini') models = modelChain(get('GEMINI_MODEL'), get('GEMINI_MODELS'), provider === base.provider ? base.models : GEMINI_CHAIN);
  else models = provider === base.provider ? [...base.models] : [...(DEFAULT_MODELS[provider] || [])];
  const baseUrl = String(get(`${pre}_BASE_URL`) || get('AI_OPENAI_BASE_URL') || '').trim().replace(/\/+$/, '');
  const cfg = { ...base, feature, provider, models, baseUrl, error: null };
  if (!PROVIDERS.includes(provider)) cfg.error = 'unknown_provider';
  else if (!models.length) cfg.error = 'no_models';
  else if (provider === 'openai' && !/^https:\/\/[^/\s]+/.test(baseUrl)) cfg.error = 'no_base_url';
  if (FORBIDDEN.test(provider) || models.some((m) => FORBIDDEN.test(m)) || FORBIDDEN.test(baseUrl)) cfg.error = 'claude_api_forbidden';
  return cfg;
}

/** Can the configured provider run live search (grounding)? Only Gemini today. */
export function supportsSearch(cfg) {
  return cfg.provider === 'gemini';
}

/** Can it read PDFs and images sent inline? Gemini reads both. */
export function supportsFiles(cfg) {
  return cfg.provider === 'gemini';
}

/** Should the chain move to the next model after this status? 429, 404 and 5xx. */
export function shouldFallOver(status) {
  return status === 429 || status === 404 || status >= 500;
}

/** How long attempt `index` may take, in ms, or 0 when the budget has too little left (T415). */
export function attemptTimeoutMs(index, elapsedMs, cfg = AI_FEATURES['plan-day']) {
  const left = cfg.budgetMs - Math.max(0, elapsedMs || 0);
  if (left < cfg.minMs) return 0;
  return Math.min(index === 0 ? cfg.firstMs : cfg.laterMs, left);
}

/** Worst-case Neurons for a Workers AI call: the price of the model, or the dearest known. */
export function neuronPrice(model) {
  if (NEURON_PRICES[model]) return NEURON_PRICES[model];
  const all = Object.values(NEURON_PRICES);
  return { in: Math.max(...all.map((p) => p.in)), out: Math.max(...all.map((p) => p.out)) };
}

/**
 * A model's JSON answer. strict: JSON.parse only. loose: also a fenced block
 * or the outermost {...} (a grounded answer cannot use a response schema).
 * undefined when nothing parses.
 */
export function parseModelJson(text, { loose = false } = {}) {
  const s = String(text ?? '');
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return undefined; } };
  let v = tryParse(s.trim());
  if (v !== undefined || !loose) return v;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) { v = tryParse(fence[1]); if (v !== undefined) return v; }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return tryParse(s.slice(a, b + 1));
  return undefined;
}

/* ---- provider adapters: a request in, { status, text, sources, usage } or a stream out ---- */

class HttpStatus extends Error {
  constructor(status) { super(`status ${status}`); this.status = status; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms); }),
  ]).finally(() => clearTimeout(t));
}

/** One SSE line Ask's reader understands, so a non-streaming provider can still feed it. */
function oneShotStream(text) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      if (text) c.enqueue(enc.encode(`data: ${JSON.stringify({ response: text })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

const geminiAdapter = {
  name: 'gemini',
  ready: (get) => !!get('GEMINI_API_KEY'),
  async run(req, model, ms, { get, fetchImpl }) {
    const parts = req.parts || [{ text: req.user }];
    const body = {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: [{ role: 'user', parts: parts.map((p) => (p.inline ? { inline_data: { mime_type: p.inline.mime, data: p.inline.data } } : { text: p.text })) }],
      ...(req.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxOutputTokens ?? 8192,
        // Grounding and a response schema are mutually exclusive on Gemini: one or the other.
        ...(req.json && !req.search ? { responseMimeType: 'application/json', ...(req.schema ? { responseSchema: req.schema } : {}) } : {}),
      },
    };
    const resp = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': get('GEMINI_API_KEY') },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ms),
      },
    );
    if (!resp.ok) throw new HttpStatus(resp.status);
    const data = await resp.json();
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
    const sources = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c?.web?.uri).filter(Boolean);
    const u = data?.usageMetadata || {};
    return { text, sources, usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 } };
  },
};

function chatMessages(req) {
  return [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    { role: 'user', content: req.parts ? req.parts.map((p) => p.text || '').join('\n') : req.user },
  ];
}

async function openaiStyle(url, key, req, model, ms, fetchImpl) {
  const resp = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model,
      messages: chatMessages(req),
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxOutputTokens ?? 8192,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(ms),
  });
  if (!resp.ok) throw new HttpStatus(resp.status);
  const data = await resp.json();
  const text = String(data?.choices?.[0]?.message?.content ?? '');
  return { text, sources: [], usage: { in: data?.usage?.prompt_tokens || 0, out: data?.usage?.completion_tokens || 0 } };
}

const workersAdapter = {
  name: 'workers-ai',
  ready: (get, binding) => !!binding || (!!get('CF_ACCOUNT_ID') && !!get('CF_AI_TOKEN')),
  async run(req, model, ms, { get, binding, fetchImpl }) {
    if (binding) {
      const out = await withTimeout(binding.run(model, {
        messages: chatMessages(req),
        max_tokens: req.maxOutputTokens ?? 1024,
        temperature: req.temperature ?? 0.2,
        ...(req.stream ? { stream: true } : {}),
      }), ms);
      if (req.stream) return { stream: out, sources: [], usage: null };
      return { text: String(out?.response ?? ''), sources: [], usage: null };
    }
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(get('CF_ACCOUNT_ID'))}/ai/v1/chat/completions`;
    return openaiStyle(url, get('CF_AI_TOKEN'), req, model, ms, fetchImpl);
  },
};

const openaiAdapter = {
  name: 'openai',
  ready: (get) => !!get('AI_OPENAI_API_KEY'),
  run(req, model, ms, { get, cfg, fetchImpl }) {
    return openaiStyle(`${cfg.baseUrl}/chat/completions`, get('AI_OPENAI_API_KEY'), req, model, ms, fetchImpl);
  },
};

export const ADAPTERS = { gemini: geminiAdapter, 'workers-ai': workersAdapter, openai: openaiAdapter };

/**
 * The config for a feature and whether it can run at all, checked before any
 * quota is spent: { cfg, refusal }, refusal null when the call may go ahead.
 */
export function modelAccess(feature, env = {}, binding = null) {
  const cfg = resolveModelConfig(feature, env);
  if (cfg.error) return { cfg, refusal: aiRefusal('config', { reason: cfg.error }) };
  if (!ADAPTERS[cfg.provider].ready(reader(env), binding)) return { cfg, refusal: aiRefusal('no_ai') };
  return { cfg, refusal: null };
}

/** The cache-key identity of a config: the Gemini chain alone (as before T1137), any other provider prefixed. */
export function chainKey(cfg) {
  const chain = cfg.models.join(',');
  return cfg.provider === 'gemini' ? chain : `${cfg.provider}:${chain}`;
}

/**
 * @typedef {object} AiRequest
 * @property {string} feature        a key of AI_FEATURES
 * @property {object|function} [env] the environment: an object, or a getter (Deno.env.get)
 * @property {any} [binding]         the Workers AI binding (env.AI) where there is one
 * @property {string} [system]       the system slot (aiGuard.systemRules plus the task's own)
 * @property {string} [user]         the user turn
 * @property {Array<{text?: string, inline?: {mime: string, data: string}}>} [parts] instead of user: text and inline files
 * @property {boolean} [json]        ask for JSON (with schema where the provider takes one)
 * @property {object} [schema]
 * @property {boolean} [search]      live search (Gemini grounding); refused on a provider without it
 * @property {boolean} [stream]      a stream back (Ask); a provider without one sends one piece
 * @property {number} [temperature]
 * @property {number} [maxOutputTokens]
 * @property {function} [fetchImpl]  fetch, for tests
 * @property {function} [now]        Date.now, for tests
 * @property {function} [wait]       sleep, for tests
 */

/**
 * What callModel returns. ok true: text (or stream), model, provider,
 * fellBack, sources, usage. ok false: code (AI_CODES), status (HTTP),
 * reason and upstream (the provider's status) where known.
 * @typedef {object} AiResult
 * @property {boolean} ok
 * @property {string} code
 * @property {number} status
 * @property {string} [reason]
 * @property {number} [upstream]
 * @property {string} text
 * @property {any} [stream]
 * @property {string} model
 * @property {string} provider
 * @property {boolean} fellBack
 * @property {string[]} sources
 * @property {any} usage
 * @property {object[]} attempts
 * @property {number} [ms]
 */

/**
 * The one way to call a model: the feature's provider and chain from config,
 * under the failure rules in the header.
 * @param {AiRequest} req
 * @returns {Promise<AiResult>}
 */
export async function callModel(req) {
  const get = reader(req.env);
  const fetchImpl = req.fetchImpl || ((...a) => fetch(...a));
  const now = req.now || Date.now;
  const wait = req.wait || sleep;
  const cfg = resolveModelConfig(req.feature, req.env);
  const attempts = [];
  if (cfg.error) return aiRefusal('config', { reason: cfg.error, attempts });
  const adapter = ADAPTERS[cfg.provider];
  if (!adapter.ready(get, req.binding)) return aiRefusal('no_ai', { reason: `${cfg.provider}_not_configured`, attempts });
  if (req.search && !supportsSearch(cfg)) return aiRefusal('ai_error', { reason: 'search_unsupported', attempts });
  if (req.parts && req.parts.some((p) => p.inline) && !supportsFiles(cfg)) return aiRefusal('ai_error', { reason: 'files_unsupported', attempts });
  const promptChars = String(req.system || '').length
    + (req.parts ? req.parts.reduce((n, p) => n + String(p.text || '').length, 0) : String(req.user || '').length);
  if (promptChars > cfg.maxPromptChars) return aiRefusal('too_big', { reason: 'prompt', attempts });

  // A non-streaming provider still answers a streaming caller, in one piece.
  const streamNative = req.stream && cfg.provider === 'workers-ai' && !!req.binding;
  const call = { ...req, stream: streamNative };
  const start = now();
  let lastStatus = 0;
  let timedOut = false;
  let i = 0;
  for (const model of cfg.models) {
    let tries = 0;
    let waited429 = false;
    for (;;) {
      const ms = attemptTimeoutMs(i, now() - start, cfg);
      if (!ms) break;
      const t0 = now();
      try {
        const out = await adapter.run(call, model, ms, { get, binding: req.binding, cfg, fetchImpl });
        attempts.push({ model, status: 200, ms: now() - t0 });
        const base = {
          ok: true, model, provider: cfg.provider, fellBack: model !== cfg.models[0],
          sources: out.sources || [], usage: out.usage, attempts, ms: now() - start,
        };
        if (req.stream) return { ...base, stream: streamNative ? out.stream : oneShotStream(out.text) };
        if (out.text.length > cfg.maxOutputChars) return aiRefusal('ai_bad_output', { reason: 'too_long', model, attempts });
        return { ...base, text: out.text };
      } catch (e) {
        i += 1;
        const status = e instanceof HttpStatus ? e.status : 0;
        const timeout = !status && (e?.name === 'TimeoutError' || e?.name === 'AbortError');
        attempts.push({ model, status, ...(timeout ? { error: 'timeout' } : status ? {} : { error: 'network' }), ms: now() - t0 });
        if (timeout) { timedOut = true; break; }
        if (status) {
          lastStatus = status;
          if (status === 429 && cfg.retry429Ms && !waited429 && now() - start + cfg.retry429Ms + cfg.minMs < cfg.budgetMs) {
            waited429 = true;
            await wait(cfg.retry429Ms);
            continue;
          }
          if (status >= 500 && tries === 0) { tries += 1; continue; }
          if (shouldFallOver(status)) break;
          return aiRefusal('ai_error', { upstream: status, model, attempts });
        }
        // A dropped connection: once more on the same model, then the next.
        if (tries === 0) { tries += 1; continue; }
        break;
      }
    }
  }
  if (timedOut && lastStatus !== 429) return aiRefusal('ai_timeout', { attempts });
  if (lastStatus === 429) return aiRefusal('global_cap', { attempts });
  return aiRefusal('ai_error', { upstream: lastStatus, attempts });
}
