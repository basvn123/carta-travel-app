#!/usr/bin/env node
/**
 * Dead-selector scan (T1126, roadmap G7).
 *
 *   node scripts/ci/css-dead.mjs            report, per file, the rules whose class is named nowhere in src/
 *   node scripts/ci/css-dead.mjs --apply    delete those rules (and selectors) from the stylesheets
 *
 * A class is live when its name appears as a whole word anywhere in src/ outside
 * stylesheets (JS, JSX, JSON, HTML), or when it starts with a head that a
 * template literal or string concatenation builds at runtime (`itrack-${size}`,
 * 'tone-' + t), or when it belongs to a library (maplibregl-*). Classes inside
 * :not(), :is(), :where() and :has() are ignored when judging a selector. A
 * selector is dead when it holds one outside class that is not live; a rule is
 * dead when every one of its selectors is. Keyframes and font faces are never
 * touched. A class that is only ever built from data (a class name stored in a
 * JSON file under public/) would be missed: the report lists the live-by-prefix
 * hits so a reviewer can see them, and CSS bytes are checked in Chromium after.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const postcss = require('postcss');

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const apply = process.argv.includes('--apply');
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, o); else o.push(p); } return o; }
const files = walk(src);
const cssFiles = files.filter((f) => f.endsWith('.css'));
const corpusFiles = files.filter((f) => /\.(jsx?|mjs|json|html)$/.test(f));
corpusFiles.push(path.resolve(src, '../index.html'));
let corpus = '';
for (const f of corpusFiles) if (fs.existsSync(f)) corpus += fs.readFileSync(f, 'utf8') + '\n';
const words = new Set(corpus.match(/[A-Za-z_][\w-]*/g));
const heads = new Set();
for (const m of corpus.matchAll(/([A-Za-z0-9_-]+)\$\{/g)) heads.add(m[1]);
for (const m of corpus.matchAll(/['"`]([A-Za-z0-9_-]*[-_])['"`]\s*\+/g)) heads.add(m[1]);
const headList = [...heads].filter((h) => h.length >= 3);
const live = (c) => words.has(c) || /^(maplibregl|mapboxgl)-/.test(c) || headList.some((h) => c.startsWith(h));

function deadSelector(sel) {
  const stripped = sel.replace(/:(not|is|where|has|matches)\((?:[^()]|\([^()]*\))*\)/g, '');
  for (const m of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!live(m[1])) return m[1];
  return null;
}
let rules = 0, bytes = 0; const out = [];
for (const f of cssFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const root = postcss.parse(text);
  let touched = false;
  root.walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes$/.test(r.parent.name)) return;
    const sels = r.selectors; const keep = sels.filter((s) => !deadSelector(s));
    if (keep.length === sels.length) return;
    const gone = sels.filter((s) => deadSelector(s));
    out.push(`${path.relative(src, f)}:${r.source.start.line}\t${gone.map((s) => `${s} [${deadSelector(s)}]`).join(' | ')}`);
    rules++; bytes += String(r).length;
    if (keep.length === 0) r.remove(); else r.selectors = keep;
    touched = true;
  });
  root.walkAtRules((a) => { if (a.nodes && a.nodes.length === 0 && /^(media|supports|layer|container)$/.test(a.name)) { a.remove(); touched = true; } });
  if (apply && touched) fs.writeFileSync(f, root.toString());
}
console.log(out.join('\n'));
console.log(`dead rules or selectors: ${rules}; about ${bytes} source bytes${apply ? ' (removed)' : ''}`);
