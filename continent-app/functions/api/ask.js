/**
 * GET /api/ask : Ask Carta's dense retrieval (T554). The question is
 * embedded with the open model the ask index layer pruned (T551,
 * potion-multilingual-128M, static, 256 dims, about 0.2 ms) and scored
 * against the passages of the sources asked for, filtered on their payload
 * first (country, place) the way a vector database filters on metadata, then
 * two-stage (sign bits, then int8). Free: no model server, no API, a few MB
 * of files from this deploy's own assets, held for the isolate's life.
 *
 *   q    the question (at most 200 characters)
 *   src  sources, comma separated (default dest,highlight); any of the
 *        manifest's: dest highlight sight trail journey beach lake peak country
 *   cc   ISO codes to keep, comma separated (optional)
 *   d    destination ids to keep, comma separated, at most 12 (optional)
 *   u    words the rules could not place, | separated, at most 5: each is
 *        matched to the lexicon (T552) for a facet it may mean
 *
 * Answer: { v, hits: { src: [[pid, destId, score, text, name]] }, lex: [[word, slot, value, score]] }
 * Edge cached for an hour per URL. Pages does not apply public/_headers to
 * a Function's response, so the headers are set here.
 */
import { createEmbedder } from '../_lib/askEmbed.js';
import { search } from '../_lib/askScore.js';
import { fail, methodNotAllowed, createLimiter, overLimit, rateRefusal, parseAskQuery } from '../_lib/guard.js';
import { withTracking } from '../_lib/track.js';

const BASE = '/search/ask/';
const HOLD = 3600;
const PER_SOURCE = { dest: 50, highlight: 24, sight: 16, trail: 12, journey: 8, beach: 10, lake: 10, peak: 8, country: 4 };
/** A word means a lexicon facet only this close (cosine), checked on the golden set. */
export const LEX_MIN = 0.62;

let state = null;
// The retrieval is CPU on the Function, free but not unlimited (T1079).
const limiter = createLimiter({ max: 60 });

export const onRequest = () => methodNotAllowed('GET');

async function asset(env, request, path, kind) {
  const url = new URL(BASE + path, request.url);
  const res = env?.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`ask: ${path} ${res.status}`);
  return kind === 'json' ? res.json() : res.arrayBuffer();
}

/** The manifest and the model, once per isolate; each source on first use. */
async function load(env, request) {
  if (!state) {
    state = (async () => {
      const manifest = await asset(env, request, 'manifest.json', 'json');
      const f = manifest.model_files;
      const [vocab, emb, scale] = await Promise.all([
        asset(env, request, f.vocab, 'json'), asset(env, request, f.emb, 'bin'), asset(env, request, f.scale, 'bin'),
      ]);
      return { manifest, embedder: createEmbedder({ vocab, emb, scale }), sources: new Map() };
    })().catch((e) => { state = null; throw e; });
  }
  return state;
}

async function source(s, name, env, request) {
  if (!s.sources.has(name)) {
    const m = s.manifest.sources[name];
    s.sources.set(name, (async () => {
      const [p, i8, b1] = await Promise.all([
        asset(env, request, m.passages, 'json'), asset(env, request, m.i8, 'bin'), asset(env, request, m.b1, 'bin'),
      ]);
      return { rows: p.rows, n: m.n, D: s.manifest.dims, i8: new Int8Array(i8), b1: new Uint8Array(b1) };
    })().catch((e) => { s.sources.delete(name); throw e; }));
  }
  return s.sources.get(name);
}

async function handleGet({ request, env }) {
  const url = new URL(request.url);
  const parsed = parseAskQuery(url.searchParams);
  if (!parsed) return fail(400, 'bad_request');
  const { q, words } = { q: parsed.q, words: parsed.u };
  if (await overLimit(env, request, limiter, 'ask')) return rateRefusal();
  let s;
  try { s = await load(env, request); } catch { return fail(503, 'unavailable'); }
  const asked = (parsed.src.length ? parsed.src : ['dest', 'highlight']).filter((x) => s.manifest.sources[x] && x !== 'lexicon');
  const cc = new Set(parsed.cc.map((x) => x.toUpperCase()));
  const d = new Set(parsed.d);

  const qvec = s.embedder.embed(q);
  const hits = {};
  try {
    for (const name of asked) {
      const src = await source(s, name, env, request);
      const keep = (i) => {
        const row = src.rows[i];
        if (d.size && !d.has(row[1])) return false;
        if (cc.size && !cc.has(row[3]?.cc)) return false;
        return true;
      };
      const k = PER_SOURCE[name] || 10;
      hits[name] = search(qvec, src, { k1: Math.max(200, k * 10), k, filter: cc.size || d.size ? keep : undefined })
        .map(({ i, score }) => {
          const r = src.rows[i];
          return [r[0], r[1], Math.round(score * 1000) / 1000, r[2], r[3]?.name || ''];
        });
    }
  } catch {
    return fail(503, 'unavailable');
  }
  const lex = [];
  if (words.length && s.manifest.sources.lexicon) {
    const L = await source(s, 'lexicon', env, request);
    for (const w of words) {
      const [best] = search(s.embedder.embed(w), L, { k1: 64, k: 1 });
      if (best && best.score >= LEX_MIN) {
        const p = L.rows[best.i][3] || {};
        lex.push([w, p.slot, p.value, Math.round(best.score * 1000) / 1000]);
      }
    }
  }
  return new Response(JSON.stringify({ v: s.manifest.version, hits, lex }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${HOLD}`,
      'x-content-type-options': 'nosniff',
    },
  });
}

export const onRequestGet = withTracking('api/ask', handleGet);
