// T480: the English catalogue in two parts, split at build time.
//
// src/i18n/en.js stays the one file translators and tooling edit. At build
// time this plugin cuts it into:
//   - virtual:carta-en       the strings the first paint can reach (eager)
//   - virtual:carta-en-rest  everything else, a lazy chunk that adds itself
//                            to the catalogue when it evaluates
//
// The split rule, no hand-kept list: walk the STATIC import graph from
// src/main.jsx (dynamic import() edges are not followed, those are the lazy
// chunks). Every module reached ships before first paint, so every key it
// names is eager. A key is "named" when the source holds it as a token
// ('trip.title'), or when the source holds a prefix of it in front of a
// template slot or a concatenation (`month.${m}`, 'cat.' + id), or a suffix
// of it behind a template slot (`${kind}.title`). Over-inclusion only costs
// bytes; it never shows a raw key.
//
// Every src module OUTSIDE that graph that names a key gets a static
// `import 'virtual:carta-en-rest'` prepended, so a lazy chunk can never
// evaluate before the rest of English is in the catalogue.
//
// The dev server skips all of this: the eager module is the whole of en.js and
// the rest module is empty, so editing en.js hot-reloads as before.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EAGER_ID = 'virtual:carta-en';
const REST_ID = 'virtual:carta-en-rest';
const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];
const CODE_RE = /\.(?:js|jsx|mjs)$/;

// import x from './a', import './a', export { y } from './a', export * from './a'
const STATIC_IMPORT_RE = /\b(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g;
const TOKEN_RE = /[A-Za-z][\w-]*(?:\.[\w-]+)+/g;
// A dotted string that opens a literal, and what follows it: the close of a
// plain string, a template slot, or anything else.
const OPENER_RE = /(?<=['"`])([A-Za-z][\w-]*(?:\.[\w-]*)+)(\$\{|['"`]\s*\+|['"`])?/g;
const SUFFIX_RE = /\}(\.[\w-]+(?:\.[\w-]+)*)(?=[`$'"])/g;

const norm = (p) => path.resolve(p).replace(/\\/g, '/');

function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec.split('?')[0]);
  for (const ext of EXTS) {
    const f = base + ext;
    if (CODE_RE.test(f) && fs.existsSync(f) && fs.statSync(f).isFile()) return norm(f);
  }
  return null;
}

/** Every src module the entry reaches through static imports alone. */
function staticGraph(entry) {
  const seen = new Set([norm(entry)]);
  const queue = [norm(entry)];
  while (queue.length) {
    const file = queue.pop();
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(STATIC_IMPORT_RE)) {
      const dep = resolveLocal(file, m[1]);
      if (dep && !seen.has(dep)) { seen.add(dep); queue.push(dep); }
    }
  }
  return seen;
}

/** The keys of `keys` (sorted) that `code` names, by token, prefix or suffix. */
function namedKeys(code, keys, keySet) {
  const out = new Set();
  const withPrefix = (pre) => {
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < pre) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < keys.length && keys[i].startsWith(pre); i += 1) out.add(keys[i]);
  };
  for (const [tok] of code.matchAll(TOKEN_RE)) if (keySet.has(tok)) out.add(tok);
  // 'trip.check' + n, `score.band${tier}`, 'journey.typeDesc' fed to replace():
  // a string that opens with a key's start, and is not itself a whole key
  // closed right there, stands for every key it begins.
  for (const [, tok, next] of code.matchAll(OPENER_RE)) {
    if (keySet.has(tok) && next && !next.startsWith('$') && !next.includes('+')) continue;
    withPrefix(tok);
  }
  for (const [, suf] of code.matchAll(SUFFIX_RE)) for (const k of keys) if (k.endsWith(suf)) out.add(k);
  return out;
}

/** { eager, rest, graph }: the two halves of en and the eager module set. */
export async function splitEnglish(appRoot) {
  const enFile = path.join(appRoot, 'src/i18n/en.js');
  const { en } = await import(`${pathToFileURL(enFile).href}?t=${fs.statSync(enFile).mtimeMs}`);
  const keys = Object.keys(en).sort();
  const keySet = new Set(keys);
  const graph = staticGraph(path.join(appRoot, 'src/main.jsx'));
  const named = new Set();
  for (const file of graph) {
    // The catalogues themselves name every key; only the code that reads them counts.
    if (file.includes('/src/i18n/')) continue;
    for (const k of namedKeys(fs.readFileSync(file, 'utf8'), keys, keySet)) named.add(k);
  }
  const eager = {};
  const rest = {};
  for (const k of keys) (named.has(k) ? eager : rest)[k] = en[k];
  return { eager, rest, graph, keys, keySet };
}

export function englishSplit(appRoot) {
  let isBuild = false;
  let split = null;
  const indexFile = norm(path.join(appRoot, 'src/i18n/index.jsx'));
  const srcDir = `${norm(path.join(appRoot, 'src'))}/`;
  return {
    name: 'carta-english-split',
    enforce: 'pre',
    configResolved(config) { isBuild = config.command === 'build'; },
    async buildStart() {
      if (isBuild) split = await splitEnglish(appRoot);
    },
    resolveId(id) {
      if (id === EAGER_ID || id === REST_ID) return `\0${id}`;
      return null;
    },
    load(id) {
      if (id === `\0${EAGER_ID}`) {
        if (!isBuild) return "export { en as enEager } from '/src/i18n/en.js';\nexport const enWhole = true;\n";
        return `export const enEager = ${JSON.stringify(split.eager)};\nexport const enWhole = false;\n`;
      }
      if (id === `\0${REST_ID}`) {
        if (!isBuild) return 'export {};\n';
        return `import { addEnglish } from ${JSON.stringify(indexFile)};\naddEnglish(${JSON.stringify(split.rest)});\n`;
      }
      return null;
    },
    transform(code, id) {
      if (!isBuild) return null;
      const file = norm(id.split('?')[0]);
      if (!file.startsWith(srcDir) || !CODE_RE.test(file) || split.graph.has(file)) return null;
      if (file.startsWith(`${srcDir}i18n/`)) return null;
      if (!/\buseI18n\b|\bt\(/.test(code) && namedKeys(code, split.keys, split.keySet).size === 0) return null;
      return { code: `import '${REST_ID}';\n${code}`, map: null };
    },
    generateBundle(_, bundle) {
      if (!isBuild) return;
      // The split only pays if the rest stays out of the first paint: warn if a
      // static edge from the entry ever pulls it in.
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const byName = new Map(chunks.map((c) => [c.fileName, c]));
      const eager = new Set();
      const walk = (c) => { if (!c || eager.has(c)) return; eager.add(c); c.imports.forEach((f) => walk(byName.get(f))); };
      chunks.filter((c) => c.isEntry).forEach(walk);
      for (const c of eager) {
        if (Object.keys(c.modules).includes(`\0${REST_ID}`)) this.warn(`the lazy half of English landed in first-paint chunk ${c.fileName}`);
      }
    },
  };
}
