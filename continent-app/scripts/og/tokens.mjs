/**
 * tokens.mjs, the design tokens for the generated images.
 *
 * Nothing here is typed in. Every colour is read from the :root block of
 * src/styles.css, which is the source of truth (DESIGN.md is its record), so
 * a token change reaches the share images the next time they are generated.
 * The three font tokens are read the same way and the first family in each
 * stack is the one the page loads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(HERE, '..', '..');
const CSS = path.join(APP_ROOT, 'src', 'styles.css');

function rootBlock(css) {
  const start = css.indexOf(':root');
  if (start < 0) throw new Error('no :root block in styles.css');
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(open + 1, i); }
  }
  throw new Error('unterminated :root block');
}

export function readTokens() {
  const block = rootBlock(fs.readFileSync(CSS, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

const TOKENS = readTokens();

/** A colour token as a hex string; throws rather than draw with a guess. */
export function colour(name) {
  const v = TOKENS[name];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`token --${name} is not a hex colour in :root (${v})`);
  return v.toLowerCase();
}

/** Mix two hex colours, the way color-mix(in srgb) does. share is the first colour's part. */
export function mix(a, b, share) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  const c = x.map((v, i) => Math.round(v * share + y[i] * (1 - share)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const family = (name) => {
  const first = (TOKENS[name] || '').split(',')[0].replace(/['"]/g, '').trim();
  if (!first) throw new Error(`token --${name} missing`);
  return first;
};

export const C = {
  paper: colour('paper'),
  paperDim: colour('paper-dim'),
  card: colour('bg-card'),
  ink: colour('ink'),
  inkSoft: colour('ink-soft'),
  inkMute: colour('ink-mute'),
  rule: colour('rule'),
  ruleSoft: colour('rule-soft'),
  accent: colour('accent'),
  rate: colour('rate'),
  rateBg: colour('rate-bg'),
  green: colour('green'),
};
C.good = mix(C.green, C.card, 0.16); // the MonthStrip's good cell: green 16% on the card

export const F = {
  display: family('display'),
  ui: family('ui'),
  mono: family('mono'),
};

export const stack = (name) => `'${F[name]}', ${name === 'display' ? 'Georgia, serif' : name === 'mono' ? 'monospace' : 'sans-serif'}`;
