#!/usr/bin/env node
/**
 * build-ask-bm25.mjs: the BM25 half of the Ask Carta index (T551).
 *
 * Reads public/search/ask/manifest.json and the passages-<src>.json files
 * pipeline/ask_index_layer.py wrote, builds one MiniSearch index over them
 * (fields name x3, tags x2, text x1; id = pid; nothing stored; the options
 * in functions/_lib/askTerms.js) and writes its toJSON() to bm25.json. The
 * browser downloads that file whole, so it has a budget: over BUDGET_GZIP
 * with every source, it is rebuilt over dest + lexicon only (T554), and
 * manifest.bm25.sources says which sources it covers. Dense retrieval covers
 * every source either way.
 *
 *   node scripts/build-ask-bm25.mjs [--dir public/search/ask] [--sources dest,highlight]
 *
 * run_pipeline.py task `ask_index` runs it straight after the Python layer.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import MiniSearch from 'minisearch';
import { ASK_BM25_OPTIONS, ASK_BM25_BOOST, ASK_BM25_FIELDS, bm25Doc } from '../functions/_lib/askTerms.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_GZIP = 400 * 1024;
// T554 (row T551-c): dest + highlight was still 1,196 KB gzip; the highlights
// stay on the dense side (/api/ask), the browser keeps names and synonyms.
const FALLBACK = ['dest', 'lexicon'];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dir = resolve(appRoot, arg('--dir', 'public/search/ask'));
const manifestPath = join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`[ask-bm25] no ${manifestPath}; run python pipeline/ask_index_layer.py first`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const all = Object.keys(manifest.sources);
const asked = arg('--sources', '');

const rowsBySource = {};
function rows(src) {
  if (!rowsBySource[src]) {
    rowsBySource[src] = JSON.parse(readFileSync(join(dir, manifest.sources[src].passages), 'utf8')).rows;
  }
  return rowsBySource[src];
}

function build(sources) {
  const t0 = Date.now();
  const ms = new MiniSearch(ASK_BM25_OPTIONS);
  let n = 0;
  for (const src of sources) {
    const docs = rows(src).map(bm25Doc);
    ms.addAll(docs);
    n += docs.length;
  }
  const text = JSON.stringify(ms.toJSON());
  const gz = gzipSync(Buffer.from(text), { level: 9 }).length;
  return { sources, n, text, bytes: Buffer.byteLength(text), gz, ms: Date.now() - t0 };
}

const kb = (b) => `${Math.round(b / 1024)} KB`;
let pick;
if (asked) {
  pick = build(asked.split(',').filter((s) => all.includes(s)));
} else {
  pick = build(all);
  console.log(`[ask-bm25] every source: ${pick.n} passages, ${kb(pick.bytes)}, gzip ${kb(pick.gz)} (${pick.ms} ms)`);
  if (pick.gz > BUDGET_GZIP) {
    const small = build(FALLBACK.filter((s) => all.includes(s)));
    console.log(`[ask-bm25] over the ${kb(BUDGET_GZIP)} gzip budget; ${small.sources.join(' + ')}: `
      + `${small.n} passages, ${kb(small.bytes)}, gzip ${kb(small.gz)} (${small.ms} ms)`);
    pick = small;
  }
}

const out = join(dir, 'bm25.json');
writeFileSync(`${out}.tmp`, pick.text);
renameSync(`${out}.tmp`, out);
manifest.bm25 = {
  file: 'bm25.json',
  fields: [...ASK_BM25_FIELDS],
  boost: { ...ASK_BM25_BOOST },
  sources: pick.sources,
  n: pick.n,
  bytes: pick.bytes,
  gzip: pick.gz,
  options: 'functions/_lib/askTerms.js ASK_BM25_OPTIONS (lower case, accents folded)',
};
writeFileSync(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 1)}\n`);
renameSync(`${manifestPath}.tmp`, manifestPath);
console.log(`[ask-bm25] wrote ${out}: ${pick.sources.join(' + ')}, ${pick.n} passages, ${kb(pick.bytes)}, gzip ${kb(pick.gz)}`);
