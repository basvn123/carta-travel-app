/*
 * Ask Carta, on device (T557): an open model in the traveller's own browser.
 *
 * The written answer (generate.js) asks this module first. When the
 * traveller switched it on and the model is loaded in this tab, the answer
 * is written on their own device with WebGPU: private, no quota, and it
 * works offline once the files are cached. Otherwise generate.js falls back
 * to the server.
 *
 * Rules this module keeps:
 *   - Never downloads on its own. Only install() fetches the model, and only
 *     a click calls install(). ensureLoaded() reads the cache and nothing
 *     else.
 *   - WebLLM (@mlc-ai/web-llm, Apache-2.0) is never in the main bundle. It
 *     loads by dynamic import and in its own Web Worker, the first time
 *     install() or ensureLoaded() runs.
 *   - The model files come from Carta's own data host (the CSP allows no
 *     other), under VITE_ASK_MODEL_BASE. VITE_ASK_MODEL_BASE=hf points a dev
 *     server at Hugging Face and the MLC GitHub libraries instead.
 *
 *   isSupported()        -> Promise<boolean>  WebGPU adapter with shader-f16,
 *                                             and 4 GB of memory when known
 *   isInstalled()        -> Promise<boolean>  every model file in Cache Storage
 *   install({onProgress})-> Promise<void>     download and load; onProgress({progress 0..1, text})
 *   isReady()            -> boolean           loaded in this tab
 *   ensureLoaded()       -> Promise<boolean>  load from the cache, no download
 *   generate({system, user, onToken, signal}) -> Promise<string>
 *   remove()             -> Promise<void>     unload, delete the cached files, opt out
 *   isOptedIn() / setOptIn(on)                the choice, kept in localStorage
 *   ON_DEVICE_MODEL      {id, label, sizeMb}
 */
import { MAX_ANSWER_TOKENS } from './context.js';

// Written out per key so Vite replaces each one at build time (and the dev
// handle at the bottom drops out of a production build); node has no env.
const DEV = import.meta.env ? import.meta.env.DEV : false;
const ENV_BASE = import.meta.env ? import.meta.env.VITE_ASK_MODEL_BASE : undefined;
const ENV_MODEL = import.meta.env ? import.meta.env.VITE_ASK_MODEL : undefined;

/** The traveller's choice, one key, read and written in try/catch. */
export const OPT_IN_KEY = 'carta.ask.onDevice.v1';

/** Where the model files live on the data host (the owner uploads them there). */
export const DEFAULT_MODEL_BASE = 'https://data.carta-europetravel.com/ask/model/';

/**
 * WebLLM's prebuilt model library folder for the pinned npm version
 * (modelVersion in @mlc-ai/web-llm 0.2.85). A test checks it still matches,
 * so an upgrade of the package cannot silently load the wrong .wasm.
 */
export const LIB_VERSION = 'v0_2_84/base';

const HF_MODELS = 'https://huggingface.co/mlc-ai/';
const HF_LIBS = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/';

/**
 * The two open models. Qwen 2.5 1.5B is the default: smallest download that
 * still writes six languages. Gemma 2 2B is the documented alternative for
 * the end check bake-off (WebLLM 0.2.85 ships no Gemma 3 1B build).
 */
export const MODELS = {
  qwen: {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 1.5B',
    sizeMb: 845, // 839.5 MB of weights and tokenizer + 5.0 MB library
    lib: 'Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
    vramMb: 1630,
    systemInUser: false,
  },
  gemma: {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    label: 'Gemma 2 2B',
    sizeMb: 1429, // 1,423.8 MB + 5.0 MB library
    lib: 'gemma-2-2b-it-q4f16_1_cs1k-webgpu.wasm',
    vramMb: 1896,
    systemInUser: true, // Gemma's chat template has no system turn
  },
};

let modelKey = MODELS[ENV_MODEL] ? ENV_MODEL : 'qwen';
const current = () => MODELS[modelKey];

/** The model this build uses: {id, label, sizeMb}. */
export const ON_DEVICE_MODEL = Object.freeze({ id: current().id, label: current().label, sizeMb: current().sizeMb });

/** The base the model files are read from, always ending in a slash. */
export function modelBase(raw = ENV_BASE) {
  const b = String(raw || DEFAULT_MODEL_BASE).trim();
  if (b === 'hf') return 'hf';
  const abs = b.startsWith('/') && typeof location !== 'undefined' ? location.origin + b : b;
  return abs.endsWith('/') ? abs : abs + '/';
}

/**
 * WebLLM's model record for one model under one base. WebLLM appends
 * "resolve/main/" to any model URL without a "/resolve/x/" part, so the data
 * host keeps the Hugging Face folder shape: <base><id>/resolve/main/<file>.
 */
export function modelRecord(key = modelKey, raw = ENV_BASE) {
  const m = MODELS[key];
  if (!m) throw new Error(`unknown model ${key}`);
  const base = modelBase(raw);
  const hf = base === 'hf';
  return {
    model_id: m.id,
    model: hf ? `${HF_MODELS}${m.id}/resolve/main/` : `${base}${m.id}/resolve/main/`,
    model_lib: hf ? `${HF_LIBS}${LIB_VERSION}/${m.lib}` : `${base}libs/${LIB_VERSION}/${m.lib}`,
    vram_required_MB: m.vramMb,
    low_resource_required: true,
    required_features: ['shader-f16'],
    overrides: { context_window_size: 4096 },
  };
}

export function appConfig(key = modelKey, raw = ENV_BASE) {
  return { model_list: [modelRecord(key, raw)] };
}

// ---- the traveller's choice ------------------------------------------------

function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function isOptedIn() {
  try { return store()?.getItem(OPT_IN_KEY) === '1'; } catch { return false; }
}

export function setOptIn(on) {
  try {
    const s = store();
    if (!s) return;
    if (on) s.setItem(OPT_IN_KEY, '1');
    else s.removeItem(OPT_IN_KEY);
  } catch { /* private window: the choice lasts this tab only */ }
}

// ---- what this device can do -----------------------------------------------

let supportMemo = null;

/** WebGPU with shader-f16 (the q4f16 models need it), and 4 GB when the browser says. */
export function isSupported() {
  if (supportMemo) return supportMemo;
  supportMemo = (async () => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.gpu?.requestAdapter) return false;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return false;
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      return !!adapter && !!adapter.features?.has?.('shader-f16');
    } catch {
      return false;
    }
  })();
  return supportMemo;
}

/** Test hook: forget the memoised answer. */
export function _resetSupport() { supportMemo = null; }

const CACHES = ['webllm/model', 'webllm/config', 'webllm/wasm'];

/**
 * Every file of the model already in Cache Storage. Reads the cache directly
 * (the same keys WebLLM writes) so the check never loads WebLLM itself.
 */
export async function isInstalled() {
  if (typeof caches === 'undefined') return false;
  try {
    const rec = modelRecord();
    const model = await caches.open('webllm/model');
    const indexUrl = new URL('tensor-cache.json', rec.model).href;
    const index = await model.match(indexUrl);
    if (!index) return false;
    const records = (await index.json())?.records || [];
    for (const r of records) if (!(await model.match(new URL(r.dataPath, rec.model).href))) return false;
    const wasm = await caches.open('webllm/wasm');
    return !!(await wasm.match(rec.model_lib));
  } catch {
    return false;
  }
}

// ---- the engine --------------------------------------------------------------

let engine = null;
let worker = null;
let loading = null;
let running = null;

export function isReady() { return !!engine; }

function startWorker() {
  return new Worker(new URL('./onDevice.worker.js', import.meta.url), { type: 'module' });
}

async function load(onProgress) {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    worker = startWorker();
    try {
      engine = await CreateWebWorkerMLCEngine(worker, current().id, {
        appConfig: appConfig(),
        initProgressCallback: (r) => onProgress?.({ progress: Math.max(0, Math.min(1, r?.progress ?? 0)), text: r?.text || '' }),
      });
      return engine;
    } catch (e) {
      worker?.terminate();
      worker = null;
      engine = null;
      throw e;
    }
  })();
  try { return await loading; } finally { loading = null; }
}

/** Download (when needed) and load. Only ever called from a click. */
export async function install({ onProgress } = {}) {
  if (!(await isSupported())) throw Object.assign(new Error('unsupported'), { reason: 'unsupported' });
  setOptIn(true);
  await load(onProgress);
  onProgress?.({ progress: 1, text: '' });
}

/** Load from the cache only. False when the files are not all there. */
export async function ensureLoaded({ onProgress } = {}) {
  if (engine) return true;
  if (!isOptedIn() || !(await isSupported()) || !(await isInstalled())) return false;
  try { await load(onProgress); return true; } catch { return false; }
}

function abortError() {
  return Object.assign(new Error('aborted'), { name: 'AbortError', reason: 'aborted' });
}

/** Neither model reads the Qwen 3 "/no_think" switch; leave it out so they cannot echo it. */
function cleanSystem(system) {
  return String(system || '').replace(/\s*\/no_think\s*$/, '').trim();
}

export function messagesFor(system, user, key = modelKey) {
  const sys = cleanSystem(system);
  if (MODELS[key]?.systemInUser) return [{ role: 'user', content: sys ? `${sys}\n\n${user}` : user }];
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/**
 * Write one answer, streaming each piece to onToken. Rejects when the model
 * is not loaded (generate.js then uses the server) and on abort.
 */
export async function generate({ system, user, onToken = () => {}, signal } = {}) {
  if (!engine) throw Object.assign(new Error('not ready'), { reason: 'off' });
  if (signal?.aborted) throw abortError();
  // One answer at a time: a new question stops the one still writing.
  if (running) { try { await engine.interruptGenerate(); } catch { /* already done */ } await running.catch(() => {}); }
  const eng = engine;
  const stop = () => { try { eng.interruptGenerate(); } catch { /* gone */ } };
  signal?.addEventListener('abort', stop, { once: true });
  const job = (async () => {
    let text = '';
    const stream = await eng.chat.completions.create({
      messages: messagesFor(system, user),
      stream: true,
      max_tokens: MAX_ANSWER_TOKENS,
      temperature: 0.2,
    });
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const piece = chunk?.choices?.[0]?.delta?.content;
      if (piece) { text += piece; onToken(piece); }
    }
    return text;
  })();
  running = job;
  try {
    const text = await job;
    if (signal?.aborted) throw abortError();
    return text;
  } finally {
    signal?.removeEventListener('abort', stop);
    if (running === job) running = null;
  }
}

async function unload() {
  const eng = engine;
  engine = null;
  try { await eng?.unload?.(); } catch { /* worker already gone */ }
  worker?.terminate();
  worker = null;
}

/** Unload, delete every cached WebLLM file of this site, and opt out. */
export async function remove() {
  await unload();
  setOptIn(false);
  if (typeof caches === 'undefined') return;
  for (const name of CACHES) { try { await caches.delete(name); } catch { /* blocked storage */ } }
}

// ---- the end check's handle (dev server only) ---------------------------------

if (DEV && typeof window !== 'undefined') {
  window.__askOnDevice = {
    MODELS, isSupported, isInstalled, install, isReady, ensureLoaded, generate, remove, appConfig,
    /** Switch between 'qwen' and 'gemma' for the bake-off; unloads the other. */
    async useModel(key) {
      if (!MODELS[key]) throw new Error(`unknown model ${key}`);
      await unload();
      modelKey = key;
      return modelRecord();
    },
    model: () => ({ key: modelKey, ...modelRecord() }),
    /** One timed answer: {text, firstTokenMs, totalMs, pieces}. */
    async timed(system, user) {
      const t0 = performance.now();
      let first = null;
      let pieces = 0;
      const text = await generate({ system, user, onToken: () => { pieces++; if (first == null) first = performance.now() - t0; } });
      return { model: modelKey, text, firstTokenMs: Math.round(first ?? 0), totalMs: Math.round(performance.now() - t0), pieces };
    },
  };
}
