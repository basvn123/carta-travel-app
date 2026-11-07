#!/usr/bin/env node
/**
 * Breakpoint scale check (T1126, roadmap G7).
 *
 *   node scripts/ci/css-breakpoints.mjs            list every width in use
 *   node scripts/ci/css-breakpoints.mjs --check    fail on a width outside the scale
 *   node scripts/ci/css-breakpoints.mjs --rewrite  snap off-scale widths to the scale
 *
 * The scale lives in SCALE below and is written up in src/styles/01-tokens.css.
 * A boundary b is written max-width: b-1 for 600, 1024 and 1280 (the JS twins in
 * the planners use 599, 1023, 1279), min-width: b+1 for 768 (legacy 768/769
 * split, 123 rules) and plain b elsewhere. Widths that a matchMedia call in
 * JSX also uses stay put until the JS moves with them (see register row).
 * Only @media width queries are read; @container, height and pointer queries
 * are not breakpoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
export const SCALE = [360, 380, 420, 430, 480, 600, 700, 768, 1024, 1100, 1200, 1240, 1280, 1440, 1600, 1800];
const MINUS_ONE = new Set([600, 1024, 1280]);
const SNAP = { 400: 420, 500: 480, 520: 480, 560: 600, 620: 600, 640: 600, 680: 700, 720: 700, 760: 768,
  880: 1024, 900: 1024, 910: 1024, 1000: 1024, 1040: 1024, 1060: 1100, 1120: 1100, 1180: 1200 };
const MAX_PLUS_ONE = new Set([359, 379, 419, 429, 479, 499, 559, 599, 639, 699, 719, 999, 1023, 1279, 1439]);

export function boundary(op, w) {
  if (op === 'max') return MAX_PLUS_ONE.has(w) ? w + 1 : w;
  return w === 769 ? 768 : w;
}
export function emit(op, b) {
  if (op === 'max') return MINUS_ONE.has(b) ? b - 1 : b;
  return b === 768 ? 769 : b;
}
export function snap(b) { return SNAP[b] ?? b; }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}
const WIDTH = /\(\s*(min|max)-width:\s*(\d+)px\s*\)/g;
const rewriteQuery = (q) => q.replace(WIDTH, (_, op, w) => `(${op}-width: ${emit(op, snap(boundary(op, +w)))}px)`);

const mode = process.argv[2] || '';
const seen = new Map();
let changed = 0;
for (const f of walk(root)) {
  const src = fs.readFileSync(f, 'utf8');
  const next = src.replace(/@media([^{]*)\{/g, (m, q) => {
    for (const x of q.matchAll(WIDTH)) { const k = `${x[1]}-width:${x[2]}`; seen.set(k, (seen.get(k) || 0) + 1); }
    return mode === '--rewrite' ? `@media${rewriteQuery(q)}{` : m;
  });
  if (next !== src) { fs.writeFileSync(f, next); changed++; }
}
const widths = new Set([...seen.keys()].map((k) => { const [op, w] = k.split('-width:'); return boundary(op, +w); }));
const off = [...widths].filter((b) => !SCALE.includes(b)).sort((a, b) => a - b);
console.log(`distinct width values: ${new Set([...seen.keys()].map((k) => k.split(':')[1])).size}; distinct boundaries: ${widths.size}; off-scale: ${off.join(', ') || 'none'}; files rewritten: ${changed}`);
if (mode === '--list') console.log([...seen].sort().map(([k, n]) => `${n}\t${k}`).join('\n'));
if (mode === '--check' && off.length) process.exit(1);
