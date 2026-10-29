/**
 * Token contrast check (T421). Reads the :root of src/styles/01-tokens.css,
 * resolves var() chains, and checks every foreground and background pair the
 * product uses as text or as a label on a fill against WCAG 2 contrast.
 * T418 found the walker missed accent text on its own tint (3.8:1); this
 * check works on the tokens themselves, so a pair cannot regress unseen.
 *
 * T438 added two more lists: non-text marks at 3:1 (WCAG 1.4.11: the focus
 * ring, the selected edge, the rating star, the switch track) and colour
 * distance, so the warning, best value and quiet tints stay visibly apart
 * from the brown action and selection (CIE76 delta E, Lab).
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
  ['--action', '--surface', 4.5, 'action link on a card'],
  ['--action', '--surface-page', 4.5, 'action link on the page'],
  ['--action', '--action-tint', 4.5, 'action text on its own tint (T363-a, T418)'],
  ['--action', '--surface-sunken', 4.5, 'action text on a sunken band'],
  ['--amber-ink', '--surface', 4.5, 'warning text'],
  ['--amber-ink', '--amber-bg', 4.5, 'warning text on its tint'],
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

// Non-text marks against what they sit on, at the 3:1 floor (T438).
const MARKS = [
  ['--focus', '--surface', 'focus ring on a card'],
  ['--focus', '--surface-page', 'focus ring on the page'],
  ['--focus', '--select-bg', 'focus ring on a selected item'],
  ['--select-border', '--surface', 'selected edge on a card'],
  ['--rate', '--surface', 'rating star on a card'],
  ['--text-3', '--surface', 'switch track, off'],
  ['--action', '--surface', 'switch track, on'],
  // T845: the four cost groups' colours, on the cost bar and as dots.
  ['--cost-travel', '--surface', 'flights on the cost bar'],
  ['--cost-around', '--surface', 'getting around on the cost bar'],
  ['--cost-stay', '--surface', 'stay on the cost bar'],
  ['--cost-food', '--surface', 'food on the cost bar'],
];

// Colours that must not be mistaken for each other (T438): CIE76 delta E.
const DISTINCT = [
  ['--action', '--amber-ink', 15, 'a link against a warning'],
  ['--action', '--danger', 15, 'a link against a destructive action'],
  // T845: the cost groups stay apart from each other and from the brown.
  ['--cost-travel', '--cost-around', 15, 'flights against getting around'],
  ['--cost-around', '--cost-stay', 15, 'getting around against stay'],
  ['--cost-stay', '--cost-food', 15, 'stay against food'],
  ['--cost-travel', '--cost-food', 15, 'flights against food'],
  ['--cost-stay', '--action', 15, 'stay against the action brown'],
  ['--cost-food', '--action', 15, 'food against the action brown'],
  ['--select-bg', '--best-bg', 8, 'selected against best value'],
  ['--select-bg', '--rate-bg', 8, 'selected against a quiet band'],
  ['--select-bg', '--gem-bg', 8, 'selected against a gem badge'],
  ['--select-bg', '--amber-bg', 4, 'selected against a warning tint'],
];

function lab(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const xyz = [
    (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047,
    (r * 0.2126 + g * 0.7152 + b * 0.0722),
    (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}
const deltaE = (a, b) => { const [p, q] = [lab(a), lab(b)]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

const all = process.argv.includes('--all');
let fails = 0;
for (const [fg, bg, floor, what] of PAIRS) {
  const r = ratio(resolve(fg), resolve(bg));
  const ok = r >= floor;
  if (!ok) fails++;
  if (all || !ok) console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${fg} on ${bg}  (${what})`);
}
for (const [fg, bg, what] of MARKS) {
  const r = ratio(resolve(fg), resolve(bg));
  const ok = r >= 3;
  if (!ok) fails++;
  if (all || !ok) console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${fg} on ${bg}  (${what}, 3:1)`);
}
for (const [a, b, floor, what] of DISTINCT) {
  const d = deltaE(resolve(a), resolve(b));
  const ok = d >= floor;
  if (!ok) fails++;
  if (all || !ok) console.log(`${ok ? 'PASS' : 'FAIL'}  dE ${d.toFixed(1)}  ${a} vs ${b}  (${what}, at least ${floor})`);
}
console.log(`token-contrast: ${PAIRS.length} text pairs, ${MARKS.length} marks, ${DISTINCT.length} distances, ${fails} under the floor`);
process.exit(fails ? 1 : 0);
