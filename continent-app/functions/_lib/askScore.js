/**
 * askScore.js: dense scoring for Ask Carta (T551).
 *
 * Two stages over one source's vectors (public/search/ask/vectors-<src>.*):
 *   1. Hamming distance between the query's sign bits and each row's .b1
 *      bits keeps the k1 closest rows (ties by row order);
 *   2. the int8 dot product (.i8 rows are unit vectors x127) ranks those k1
 *      and the best k come back as { i, score }, score ~ cosine.
 * Pure ESM, no node APIs: runs in the Pages Function and in node tests.
 * pipeline/ask_index_layer.py two_stage() is the Python mirror.
 */

const POP = new Uint8Array(256);
for (let i = 1; i < 256; i += 1) POP[i] = (i & 1) + POP[i >> 1];

function asView(x, Ctor) {
  if (x instanceof Ctor) return x;
  if (x instanceof ArrayBuffer) return new Ctor(x);
  if (ArrayBuffer.isView(x)) return new Ctor(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('askScore: vectors must be an ArrayBuffer or a typed array');
}

/** Sign bits of a vector: dim i at byte i >> 3, bit i & 7. */
export function signBits(vec) {
  const out = new Uint8Array(Math.ceil(vec.length / 8));
  for (let i = 0; i < vec.length; i += 1) if (vec[i] > 0) out[i >> 3] |= 1 << (i & 7);
  return out;
}

/**
 * search(qvec, { b1, i8, n, D }, { k1 = 500, k = 50, filter }) -> [{ i, score }]
 *   qvec    Float32Array(D), unit length (askEmbed.embed)
 *   b1, i8  the source's vector files (ArrayBuffer or typed arrays)
 *   filter  optional (rowIndex) => bool; rows it rejects are never scored
 */
export function search(qvec, { b1, i8, n, D }, { k1 = 500, k = 50, filter } = {}) {
  const bits = asView(b1, Uint8Array);
  const rows = asView(i8, Int8Array);
  const B = D >> 3;
  if (bits.length < n * B || rows.length < n * D) throw new Error('askScore: vector files shorter than n x D');
  const qb = signBits(qvec);
  const NONE = 0xffff;
  const dist = new Uint16Array(n);
  const hist = new Uint32Array(D + 1);
  let kept = 0;
  for (let r = 0; r < n; r += 1) {
    if (filter && !filter(r)) { dist[r] = NONE; continue; }
    let h = 0;
    const off = r * B;
    for (let b = 0; b < B; b += 1) h += POP[bits[off + b] ^ qb[b]];
    dist[r] = h;
    hist[h] += 1;
    kept += 1;
  }
  if (!kept) return [];
  // The distance at which the k1-th candidate falls, by counting: O(n).
  const want = Math.min(k1, kept);
  let cut = 0;
  let below = 0;
  while (below + hist[cut] < want) { below += hist[cut]; cut += 1; }
  let atCut = want - below;
  const cand = [];
  for (let r = 0; r < n; r += 1) {
    const h = dist[r];
    if (h === NONE || h > cut) continue;
    if (h === cut) { if (atCut <= 0) continue; atCut -= 1; }
    cand.push(r);
  }
  const scored = cand.map((r) => {
    let s = 0;
    const off = r * D;
    for (let d = 0; d < D; d += 1) s += qvec[d] * rows[off + d];
    return { i: r, score: s / 127 };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return scored.slice(0, k);
}
