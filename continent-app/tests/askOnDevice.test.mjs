// T557: the pure parts of Ask Carta on device (lib/ask/onDevice.js). WebGPU
// does not run in node, so the model itself is checked in the browser end
// check; here: the opt-in, the support gate, the not-ready refusal, the cache
// check and the model URLs built from the data host base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  OPT_IN_KEY, DEFAULT_MODEL_BASE, LIB_VERSION, MODELS, ON_DEVICE_MODEL,
  isOptedIn, setOptIn, isSupported, _resetSupport, isReady, generate, ensureLoaded,
  isInstalled, modelBase, modelRecord, appConfig, messagesFor,
} from '../src/lib/ask/onDevice.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

test('opt-in persists in localStorage under carta.ask.onDevice.v1', () => {
  const s = fakeStorage();
  setGlobal('localStorage', s);
  assert.equal(OPT_IN_KEY, 'carta.ask.onDevice.v1');
  assert.equal(isOptedIn(), false);
  setOptIn(true);
  assert.equal(s._m.get(OPT_IN_KEY), '1');
  assert.equal(isOptedIn(), true);
  setOptIn(false);
  assert.equal(s._m.has(OPT_IN_KEY), false);
  assert.equal(isOptedIn(), false);
});

test('opt-in survives a storage that throws', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  setGlobal('localStorage', bad);
  assert.equal(isOptedIn(), false);
  assert.doesNotThrow(() => setOptIn(true));
  setGlobal('localStorage', undefined);
  assert.equal(isOptedIn(), false);
  assert.doesNotThrow(() => setOptIn(false));
});

test('isSupported is false without navigator.gpu', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    setGlobal('navigator', {});
    _resetSupport();
    assert.equal(await isSupported(), false);
    // An adapter with shader-f16 and enough memory passes.
    setGlobal('navigator', { deviceMemory: 8, gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) } });
    _resetSupport();
    assert.equal(await isSupported(), true);
    // No shader-f16: the q4f16 models cannot run.
    setGlobal('navigator', { gpu: { requestAdapter: async () => ({ features: new Set() }) } });
    _resetSupport();
    assert.equal(await isSupported(), false);
    // Too little memory, no adapter, a throwing adapter.
    setGlobal('navigator', { deviceMemory: 2, gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) } });
    _resetSupport();
    assert.equal(await isSupported(), false);
    setGlobal('navigator', { gpu: { requestAdapter: async () => null } });
    _resetSupport();
    assert.equal(await isSupported(), false);
    setGlobal('navigator', { gpu: { requestAdapter: async () => { throw new Error('lost'); } } });
    _resetSupport();
    assert.equal(await isSupported(), false);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    _resetSupport();
  }
});

test('generate rejects when the model is not loaded, and nothing loads on its own', async () => {
  assert.equal(isReady(), false);
  await assert.rejects(generate({ system: 's', user: 'u', onToken: () => {} }), (e) => e.reason === 'off');
  setGlobal('localStorage', fakeStorage());
  assert.equal(await ensureLoaded(), false); // not opted in: no load, no download
  assert.equal(isReady(), false);
});

test('model URLs come from the data host base, in the Hugging Face folder shape', () => {
  assert.equal(DEFAULT_MODEL_BASE, 'https://data.carta-europetravel.com/ask/model/');
  const r = modelRecord('qwen', undefined);
  assert.equal(r.model_id, 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  assert.equal(r.model, 'https://data.carta-europetravel.com/ask/model/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main/');
  assert.equal(r.model_lib, `https://data.carta-europetravel.com/ask/model/libs/${LIB_VERSION}/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm`);
  assert.deepEqual(r.required_features, ['shader-f16']);
  // A base without the slash gets one; "hf" points at Hugging Face and GitHub.
  assert.equal(modelBase('https://example.test/m'), 'https://example.test/m/');
  assert.equal(modelRecord('gemma', 'https://example.test/m').model, 'https://example.test/m/gemma-2-2b-it-q4f16_1-MLC/resolve/main/');
  const hf = modelRecord('qwen', 'hf');
  assert.equal(hf.model, 'https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main/');
  assert.equal(hf.model_lib, `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/${LIB_VERSION}/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm`);
  // A path on this site becomes absolute (WebLLM parses it with new URL).
  setGlobal('location', { origin: 'https://carta.test' });
  assert.equal(modelBase('/ask/model'), 'https://carta.test/ask/model/');
  setGlobal('location', undefined);
  assert.deepEqual(appConfig('qwen', undefined).model_list.map((m) => m.model_id), ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC']);
  assert.throws(() => modelRecord('nope'));
  assert.deepEqual(ON_DEVICE_MODEL, { id: MODELS.qwen.id, label: MODELS.qwen.label, sizeMb: MODELS.qwen.sizeMb });
});

test('LIB_VERSION and the library files match the pinned WebLLM', () => {
  const src = readFileSync(fileURLToPath(new URL('../node_modules/@mlc-ai/web-llm/lib/index.js', import.meta.url)), 'utf8');
  assert.equal(/const modelVersion = "([^"]+)"/.exec(src)?.[1], LIB_VERSION);
  for (const m of Object.values(MODELS)) {
    assert.ok(src.includes(`"/${m.lib}"`), `${m.lib} is a prebuilt library`);
    assert.ok(src.includes(`model_id: "${m.id}"`), `${m.id} is a prebuilt model`);
  }
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.match(pkg.dependencies['@mlc-ai/web-llm'], /^\d+\.\d+\.\d+$/, 'pinned to an exact version');
});

test('prompts: /no_think is dropped, Gemma gets the system text in the user turn', () => {
  const sys = 'Answer from the notes.\n/no_think';
  assert.deepEqual(messagesFor(sys, 'Q', 'qwen'), [{ role: 'system', content: 'Answer from the notes.' }, { role: 'user', content: 'Q' }]);
  assert.deepEqual(messagesFor(sys, 'Q', 'gemma'), [{ role: 'user', content: 'Answer from the notes.\n\nQ' }]);
});

test('isInstalled reads Cache Storage: false when absent, true when every file is there', async () => {
  setGlobal('caches', undefined);
  assert.equal(await isInstalled(), false);
  const rec = modelRecord();
  const stores = {
    'webllm/model': new Map([
      [new URL('tensor-cache.json', rec.model).href, { json: async () => ({ records: [{ dataPath: 'params_shard_0.bin' }, { dataPath: 'params_shard_1.bin' }] }) }],
      [new URL('params_shard_0.bin', rec.model).href, {}],
    ]),
    'webllm/wasm': new Map([[rec.model_lib, {}]]),
  };
  setGlobal('caches', { open: async (n) => ({ match: async (u) => (stores[n] || new Map()).get(u) }) });
  assert.equal(await isInstalled(), false); // shard 1 missing
  stores['webllm/model'].set(new URL('params_shard_1.bin', rec.model).href, {});
  assert.equal(await isInstalled(), true);
  stores['webllm/wasm'].clear();
  assert.equal(await isInstalled(), false); // the library is missing
  setGlobal('caches', undefined);
});
