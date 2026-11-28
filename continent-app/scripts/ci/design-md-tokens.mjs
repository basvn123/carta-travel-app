#!/usr/bin/env node
/**
 * design-md-tokens: writes DESIGN.md's token header (the YAML front matter of
 * the DESIGN.md format, github.com/google-labs-code/design.md) from the one
 * source of truth, the first :root block of src/styles/01-tokens.css.
 *
 *   node scripts/ci/design-md-tokens.mjs           rewrite the header
 *   node scripts/ci/design-md-tokens.mjs --check   exit 1 when it has drifted
 *
 * Why: the header was copied by hand and drifted from the code (K1 step C,
 * owner 2026-11-28). Values come from the tokens; which tokens appear, the
 * type weights and the component recipes are chosen here. Change a value in
 * 01-tokens.css, never in DESIGN.md's header.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../..');
const TOKENS = resolve(APP, 'src/styles/01-tokens.css');
const DESIGN = resolve(APP, '../DESIGN.md');

// ---- read the tokens ---------------------------------------------------------
const css = readFileSync(TOKENS, 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const decl = {};
for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim();
const val = (name, seen = new Set()) => {
  const key = name.startsWith('--') ? name : `--${name}`;
  if (!(key in decl)) throw new Error(`design-md-tokens: ${key} is not in the first :root block of 01-tokens.css`);
  if (seen.has(key)) throw new Error(`design-md-tokens: a var() loop at ${key}`);
  seen.add(key);
  const v = decl[key];
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? val(ref[1], seen) : v;
};

// ---- what the header holds ---------------------------------------------------
const NAME = 'Viantra house style';
const DESCRIPTION = 'The furniture of a European footpath, made for prices. A pale stone ground, green-black ink and terracotta as the one accent: the main action, links and every chosen thing. Warnings, delete and best value are ink. The blaze, the signpost plate, the relief drawn from real peaks and the price formation are its signature parts.';

// Colour tokens, by role. `primary` first, so every tool finds the accent.
const COLORS = {
  primary: 'primary', 'on-primary': 'primary-text', 'primary-hover': 'primary-hover', 'primary-press': 'primary-press',
  'brand-mark': 'brand-mark',
  'surface-page': 'surface-page', surface: 'surface', 'surface-sunken': 'surface-sunken', 'surface-hover': 'surface-hover',
  text: 'text', 'text-2': 'text-2', 'text-3': 'text-3', border: 'border', 'border-soft': 'border-soft', edge: 'edge',
  action: 'action', 'action-hover': 'action-hover', 'action-text': 'action-text',
  plate: 'plate', 'on-plate': 'on-plate',
  'wagon-go-ink': 'wagon-go-ink', 'wagon-bed': 'wagon-bed', 'wagon-bed-ink': 'wagon-bed-ink', 'wagon-food': 'wagon-food', 'wagon-food-ink': 'wagon-food-ink',
  'kind-places': 'kind-places', 'kind-trails': 'kind-trails', 'kind-beaches': 'kind-beaches', 'kind-lakes': 'kind-lakes', 'kind-mountains': 'kind-mountains', 'kind-cycling': 'kind-cycling',
  'map-route': 'map-route',
  danger: 'danger', owe: 'owe', 'warn-ink': 'amber-ink', best: 'best',
};

const UI = 'Overpass, system-ui, -apple-system, Segoe UI, sans-serif';
const PLATE = 'Sofia Sans Extra Condensed, Overpass, sans-serif';
// [name, size token, weight, line height, letter spacing, face]; sizes are the phone's (DESIGN.md "Typography" has the wider steps).
const TYPE = [
  ['display', 'text-display', 800, 1.1, '-0.02em', UI],
  ['headline', 'text-headline', 800, 1.2, '-0.018em', UI],
  ['signpost', 'text-signpost', 800, 1.05, null, PLATE],
  ['title', 'text-title', 800, 1.2, null, UI],
  ['plate', 'text-plate', 700, 1.05, null, PLATE],
  ['figure-lg', 'text-figure-lg', 800, 1, null, UI],
  ['figure', 'text-figure', 800, 1, null, UI],
  ['lead', 'text-lead', 400, 1.5, null, UI],
  ['body', 'text-body', 400, 1.35, null, UI],
  ['label', 'text-label', 600, 1.35, null, UI],
  ['micro', 'text-micro', 600, 1.35, null, UI],
];

const ROUNDED = { sm: 'radius-sm', control: 'radius-control', panel: 'radius-panel', card: 'radius-card', pill: 'radius-pill' };
const SPACING = { 1: 'space-1', 2: 'space-2', 3: 'space-3', 4: 'space-4', 5: 'space-5', 6: 'space-6', 7: 'space-7', 8: 'space-8', 9: 'space-9', tap: 'tap', 'tap-main': 'tap-main' };
// [name, duration token, curve token]
const MOTION = [
  ['press', 'dur-press', 'ease-out'], ['tick', 'dur-tick', 'ease-tick'], ['pop', 'dur-pop', 'ease-pop'],
  ['settle', 'dur-settle', 'ease-settle'], ['paint', 'dur-paint', 'ease-out'], ['sheet', 'dur-sheet', 'ease-sheet'],
  ['fast', 'dur-1', 'ease-out'], ['base', 'dur-2', 'ease-out'], ['surface', 'dur-3', 'ease-out'], ['slow', 'dur-4', 'ease-out'],
];

// The common parts as the format's component recipes (references only).
const C = (bg, fg, extra = {}) => ({ ...(bg && { backgroundColor: `{colors.${bg}}` }), ...(fg && { textColor: `{colors.${fg}}` }), ...extra });
const COMPONENTS = {
  'button-primary': C('primary', 'on-primary', { typography: '{typography.label}', rounded: '{rounded.control}', padding: '0 16px', height: '44px' }),
  'button-primary-hover': C('primary-hover', 'on-primary'),
  'button-primary-press': C('primary-press', 'on-primary'),
  'button-secondary': C('surface', 'text', { rounded: '{rounded.control}', padding: '0 16px', height: '44px' }),
  'button-quiet': C(null, 'action-hover', { rounded: '{rounded.control}', height: '44px' }),
  'button-danger': C('danger', 'on-primary', { rounded: '{rounded.control}', height: '44px' }),
  chip: C('surface', 'text', { rounded: '{rounded.pill}', padding: '0 14px', height: '36px' }),
  'chip-selected': C('action', 'action-text', { rounded: '{rounded.pill}', height: '36px' }),
  'segmented-selected': C('action', 'action-text', { rounded: '{rounded.pill}', height: '44px' }),
  'header-door': C('action', 'action-text', { rounded: '{rounded.pill}', size: '44px' }),
  field: C('surface', 'text', { typography: '{typography.lead}', rounded: '{rounded.control}', height: '44px' }),
  plate: C('plate', 'on-plate', { typography: '{typography.plate}', rounded: '{rounded.sm}', padding: '6px 26px 6px 12px', height: '52px' }),
  'plate-mark': C('action', 'action-text', { rounded: '{rounded.sm}', height: '28px' }),
  'score-plate': C('plate', 'on-plate', { rounded: '{rounded.sm}', height: '24px' }),
  'wagon-go': C('surface', 'wagon-go-ink', { rounded: '{rounded.pill}', height: '24px' }),
  'wagon-bed': C('wagon-bed', 'wagon-bed-ink', { rounded: '{rounded.pill}', height: '24px' }),
  'wagon-food': C('wagon-food', 'wagon-food-ink', { rounded: '{rounded.pill}', height: '24px' }),
  'warn-line': C(null, 'warn-ink', { typography: '{typography.label}' }),
  // The roles behind every screen, so each colour has a home an agent can read.
  page: C('surface-page', 'text', { typography: '{typography.body}' }),
  band: C('surface-sunken', 'text-2'),
  'row-hover': C('surface-hover', 'text'),
  'meta-text': C(null, 'text-3', { typography: '{typography.label}' }),
  hairline: C('border', null, { height: '1px' }),
  'hairline-soft': C('border-soft', null, { height: '1px' }),
  'control-edge': C('edge', null, { width: '1.5px' }),
  logo: C(null, 'brand-mark'),
  route: C('map-route', null, { height: '3px' }),
  'best-tag': C(null, 'best', { typography: '{typography.label}', rounded: '{rounded.sm}' }),
  'owe-figure': C(null, 'owe', { typography: '{typography.figure}' }),
  'kind-tab-places': C(null, 'kind-places'), 'kind-tab-trails': C(null, 'kind-trails'), 'kind-tab-beaches': C(null, 'kind-beaches'),
  'kind-tab-lakes': C(null, 'kind-lakes'), 'kind-tab-mountains': C(null, 'kind-mountains'), 'kind-tab-cycling': C(null, 'kind-cycling'),
  card: C('surface', 'text', { rounded: '{rounded.card}' }),
  sheet: C('surface', 'text', { rounded: '{rounded.panel}' }),
};

// ---- write it ------------------------------------------------------------------
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const lines = ['---', 'version: alpha', `name: ${q(NAME)}`, `description: ${q(DESCRIPTION)}`, 'colors:'];
for (const [k, t] of Object.entries(COLORS)) lines.push(`  ${k}: ${q(val(t))}`);
lines.push('typography:');
for (const [k, t, w, lh, ls, face] of TYPE) {
  lines.push(`  ${k}:`, `    fontFamily: ${q(face)}`, `    fontSize: ${q(val(t))}`, `    fontWeight: ${w}`, `    lineHeight: ${lh}`);
  if (ls) lines.push(`    letterSpacing: ${q(ls)}`);
  lines.push('    fontFeature: "tnum, lnum"');
}
lines.push('rounded:');
for (const [k, t] of Object.entries(ROUNDED)) lines.push(`  ${k}: ${q(val(t))}`);
lines.push('spacing:');
for (const [k, t] of Object.entries(SPACING)) lines.push(`  ${/^\d/.test(k) ? q(k) : k}: ${q(val(t))}`);
lines.push('motion:');
for (const [k, d, e] of MOTION) lines.push(`  ${k}:`, `    duration: ${q(val(d))}`, `    timingFunction: ${q(val(e))}`);
lines.push('components:');
for (const [k, props] of Object.entries(COMPONENTS)) {
  lines.push(`  ${k}:`);
  for (const [p, v] of Object.entries(props)) lines.push(`    ${p}: ${q(v)}`);
}
lines.push('---');
const header = lines.join('\n');

const doc = readFileSync(DESIGN, 'utf8');
const eol = doc.includes('\r\n') ? '\r\n' : '\n';
const flat = doc.replace(/\r\n/g, '\n');
const end = flat.indexOf('\n---', 4);
if (!flat.startsWith('---\n') || end < 0) throw new Error('design-md-tokens: DESIGN.md has no front matter to replace');
const body = flat.slice(end + 4);
const next = `${header}${body}`;

if (process.argv.includes('--check')) {
  if (next === flat) { console.log('design-md-tokens: DESIGN.md header matches 01-tokens.css'); process.exit(0); }
  const a = flat.slice(0, end + 4).split('\n'); const b = header.split('\n');
  const diff = b.filter((l, i) => a[i] !== l).slice(0, 12);
  console.error('design-md-tokens: DESIGN.md header has drifted from 01-tokens.css. Run node scripts/ci/design-md-tokens.mjs and commit.');
  for (const l of diff) console.error(`  ${l}`);
  process.exit(1);
}
writeFileSync(DESIGN, next.replace(/\n/g, eol));
console.log(`design-md-tokens: wrote ${Object.keys(COLORS).length} colours, ${TYPE.length} type styles, ${MOTION.length} motions, ${Object.keys(COMPONENTS).length} components`);
