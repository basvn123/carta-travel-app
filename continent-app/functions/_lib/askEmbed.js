/**
 * askEmbed.js: the Ask Carta query embedder (T551).
 *
 * A port of model2vec's StaticModel.encode for the pruned
 * minishlab/potion-multilingual-128M that pipeline/ask_index_layer.py ships
 * in public/search/ask/model/. Static model: no network, no runtime model
 * call, nothing paid. Pure ESM with no node APIs, so the same file runs in
 * the Pages Function (functions/api/ask.js) and in the node tests.
 *
 * The steps, each a copy of what the Python side does:
 *   1. normalise: the tokenizer's normaliser list from vocab.json in order
 *      ("nfkc" stands for the sentencepiece charsmap, which for European
 *      text is NFKC, control characters dropped and zero-width characters
 *      read as spaces; then the
 *      string and regex replaces; then strip);
 *   2. Metaspace: spaces become U+2581 and one is put in front;
 *   3. Unigram Viterbi over the pruned vocabulary (the tokenizers crate's
 *      encode_optimized: best log-probability path, an unknown character
 *      scored min_score - 10, ties keep the first path found);
 *   4. truncate to 512 tokens, drop [UNK], mean of the token rows (int8 x
 *      the row scale / 127), L2 normalise.
 *
 * tests/askEmbed.test.mjs holds it to the Python reference: cosine >= 0.99
 * and the same top ten on 50 fixture queries.
 */

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/gu;
// Control characters the charsmap deletes (tab, newline and the like stay: they are spaces).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/gu;
const UNK_PENALTY = 10;

function asInt8(x) {
  if (x instanceof Int8Array) return x;
  if (x instanceof ArrayBuffer) return new Int8Array(x);
  if (ArrayBuffer.isView(x)) return new Int8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('askEmbed: emb must be an ArrayBuffer or a typed array');
}

function asFloat32(x) {
  if (x instanceof Float32Array) return x;
  if (x instanceof ArrayBuffer) return new Float32Array(x);
  if (ArrayBuffer.isView(x)) {
    // Copy when the view is not 4-byte aligned (a Buffer slice can start anywhere).
    if (x.byteOffset % 4 === 0) return new Float32Array(x.buffer, x.byteOffset, x.byteLength / 4);
    return new Float32Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength));
  }
  throw new TypeError('askEmbed: scale must be an ArrayBuffer or a typed array');
}

function compileNormalizer(steps) {
  return (steps || []).map((s) => {
    const [kind, a, b] = s;
    if (kind === 'nfkc') return (t) => t.normalize('NFKC').replace(CONTROL, '').replace(ZERO_WIDTH, ' ');
    if (kind === 'string') return (t) => t.split(a).join(b);
    if (kind === 'regex') {
      const re = new RegExp(a, 'gu');
      return (t) => t.replace(re, b);
    }
    if (kind === 'strip') return (t) => t.trim();
    throw new Error(`askEmbed: unknown normaliser step ${kind}`);
  });
}

/**
 * loadModel({ vocab, emb, scale }) -> model
 *   vocab  model/vocab.json, parsed (or its text)
 *   emb    model/emb.i8 bytes (ArrayBuffer or typed array), vocab x dims int8
 *   scale  model/scale.f32 bytes, one float32 per vocabulary row
 */
export function loadModel({ vocab, emb, scale }) {
  const v = typeof vocab === 'string' ? JSON.parse(vocab) : vocab;
  if (!v || v.type !== 'unigram') throw new Error('askEmbed: vocab.json must be a unigram vocabulary');
  const pieces = v.pieces;
  const scores = Float64Array.from(v.scores);
  const D = v.dims;
  const E = asInt8(emb);
  const S = asFloat32(scale);
  if (E.length !== pieces.length * D) throw new Error(`askEmbed: emb holds ${E.length} bytes, want ${pieces.length} x ${D}`);
  if (S.length !== pieces.length) throw new Error(`askEmbed: scale holds ${S.length} rows, want ${pieces.length}`);
  const ids = new Map();
  let maxLen = 1;
  let minScore = Infinity;
  for (let i = 0; i < pieces.length; i += 1) {
    if (!ids.has(pieces[i])) ids.set(pieces[i], i);
    const len = [...pieces[i]].length;
    if (len > maxLen) maxLen = len;
    if (scores[i] < minScore) minScore = scores[i];
  }
  const meta = v.metaspace || {};
  return {
    dims: D,
    model: v.model,
    pieces,
    scores,
    ids,
    maxLen,
    unkId: v.unk_id,
    unkScore: minScore - UNK_PENALTY,
    replacement: meta.replacement || '▁',
    prepend: (meta.prepend || 'always') !== 'never',
    maxTokens: v.max_tokens || 512,
    normalizers: compileNormalizer(v.normalizer),
    emb: E,
    scale: S,
  };
}

/** The normalised, Metaspace-joined string the Viterbi pass reads. */
export function pretokenize(model, text) {
  let t = String(text ?? '');
  for (const step of model.normalizers) t = step(t);
  if (!t) return '';
  t = t.split(' ').join(model.replacement);
  if (model.prepend && !t.startsWith(model.replacement)) t = model.replacement + t;
  return t;
}

/** Token ids, [UNK] included, as the tokenizer returns them (no truncation). */
export function tokenize(model, text) {
  const s = pretokenize(model, text);
  if (!s) return [];
  const cps = Array.from(s);
  const n = cps.length;
  // best[i]: score of the best path ending at code point i, its last token
  // and where that token starts. starts = -1 marks an unreached position.
  const score = new Float64Array(n + 1);
  const tok = new Int32Array(n + 1).fill(-1);
  const from = new Int32Array(n + 1).fill(-1);
  from[0] = 0;
  for (let i = 0; i < n; i += 1) {
    if (from[i] < 0 && i > 0) continue;
    const base = score[i];
    let single = false;
    let piece = '';
    const top = Math.min(model.maxLen, n - i);
    for (let len = 1; len <= top; len += 1) {
      piece += cps[i + len - 1];
      const id = model.ids.get(piece);
      if (id === undefined) continue;
      const end = i + len;
      const cand = base + model.scores[id];
      if (from[end] < 0 || cand > score[end]) {
        score[end] = cand;
        tok[end] = id;
        from[end] = i;
      }
      if (len === 1) single = true;
    }
    if (!single) {
      const end = i + 1;
      const cand = base + model.unkScore;
      if (from[end] < 0 || cand > score[end]) {
        score[end] = cand;
        tok[end] = model.unkId;
        from[end] = i;
      }
    }
  }
  const out = [];
  for (let end = n; end > 0; end = from[end]) out.push(tok[end]);
  out.reverse();
  // fuse_unk: consecutive unknowns are one token, as in the tokenizers crate.
  const fused = [];
  for (const id of out) {
    if (id === model.unkId && fused.length && fused[fused.length - 1] === model.unkId) continue;
    fused.push(id);
  }
  return fused;
}

/** embed(model, text) -> Float32Array(D), L2-normalised (all zeros for no tokens). */
export function embed(model, text) {
  const D = model.dims;
  const ids = tokenize(model, text).slice(0, model.maxTokens).filter((id) => id !== model.unkId);
  const acc = new Float64Array(D);
  for (const id of ids) {
    const k = model.scale[id] / 127;
    const off = id * D;
    for (let d = 0; d < D; d += 1) acc[d] += model.emb[off + d] * k;
  }
  const out = new Float32Array(D);
  if (!ids.length) return out;
  let norm = 0;
  for (let d = 0; d < D; d += 1) {
    acc[d] /= ids.length;
    norm += acc[d] * acc[d];
  }
  norm = Math.sqrt(norm) + 1e-32;
  for (let d = 0; d < D; d += 1) out[d] = acc[d] / norm;
  return out;
}

/** A bound convenience: createEmbedder(files).embed(text). */
export function createEmbedder(files) {
  const model = loadModel(files);
  return { model, dims: model.dims, embed: (text) => embed(model, text) };
}
