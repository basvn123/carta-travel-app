/**
 * Token contrast check (T421). Reads the :root of src/styles/01-tokens.css,
 * resolves var() chains, and checks every foreground and background pair the
 * product uses as text or as a label on a fill against WCAG 2 contrast.
 * T418 found the walker missed accent text on its own tint (3.8:1); this
 * check works on the tokens themselves, so a pair cannot regress unseen.
 *
 *   node scripts/ci/token-contrast.mjs          exit 1 when a pair fails
 *   node scripts/ci/token-contrast.mjs --all    print every pair
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles/01-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = css.match(/:root\b[^{]*\{([\s\S]*?)\n\}/)[1];
const decl = {};
for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim();

export function resolve(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`cycle at ${name}`);
  seen.add(name);
  const v = decl[name];
  if (v == null) throw new Error(`${name} is not defined in 01-tokens.css`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1], seen) : v.toLowerCase();
}

function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, floor, what]
const PAIRS = [
  ['--text', '--surface-page', 4.5, 'body text on the page'],
  ['--text', '--surface', 4.5, 'body text on a card'],
  ['--text-2', '--surface-page', 4.5, 'secondary text on the page'],
  ['--text-2', '--surface-sunken', 4.5, 'secondary text on a sunken band'],
  ['--text-3', '--surface-page', 4.5, 'metadata on the page'],
  ['--text-3', '--surface', 4.5, 'metadata on a card'],
  ['--text-3', '--surface-sunken', 4.5, 'metadata on a sunken band'],
  ['--action', '--surface', 4.5, 'teal link on a card'],
  ['--action', '--surface-page', 4.5, 'teal link on the page'],
  ['--action', '--action-tint', 4.5, 'teal text on its own tint (T363-a, T418)'],
  ['--action', '--surface-sunken', 4.5, 'teal text on a sunken band'],
  ['--action-text', '--action', 4.5, 'label on a primary button'],
  ['--action-text', '--action-hover', 4.5, 'label on a hovered primary'],
  ['--action-text', '--action-press', 4.5, 'label on a pressed primary'],
  ['--on-fill', '--ink-fill', 4.5, 'label on the legacy selected fill'],
  ['--select-ink', '--select-bg', 4.5, 'selected chip label'],
  ['--text', '--best', 4.5, 'label on the best value marker'],
  ['--best-ink', '--surface', 4.5, 'best value as text'],
  ['--best-ink', '--best-bg', 4.5, 'best value text on its tint'],
  ['--on-fill', '--rate', 4.5, 'label on a rating fill'],
  ['--rate', '--rate-bg', 4.5, 'rating on its band'],
  ['--rate-soft', '--surface-page', 4.5, 'rating as text'],
  ['--on-fill', '--danger', 4.5, 'label on a destructive button'],
  ['--danger', '--surface', 4.5, 'destructive text'],
  ['--green', '--surface-page', 4.5, 'good news text'],
  ['--good-ink', '--surface', 4.5, 'open now and verified text'],
  ['--gem-ink', '--gem-bg', 4.5, 'hidden gem badge'],
  ['--on-fill', '--kind-metro', 4.5, 'label on the metro kind fill'],
  ['--on-fill', '--kind-city', 4.5, 'label on the city kind fill'],
];

const all = process.argv.includes('--all');
let fails = 0;
for (const [fg, bg, floor, what] of PAIRS) {
  const r = ratio(resolve(fg), resolve(bg));
  const ok = r >= floor;
  if (!ok) fails++;
  if (all || !ok) console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${fg} on ${bg}  (${what})`);
}
console.log(`token-contrast: ${PAIRS.length} pairs, ${fails} under the floor`);
process.exit(fails ? 1 : 0);
