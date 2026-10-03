#!/usr/bin/env node
/**
 * Design lint (T196): flags the generic-pattern regressions carta-design and
 * DESIGN.md ban, so they fail at build time instead of in review.
 *
 * Rules (each one is a line or block check, no browser needed):
 *   hex-literal      a hex colour in a stylesheet outside the :root block
 *   gradient         any linear/radial/conic gradient in a stylesheet
 *   shadow-literal   a box-shadow or text-shadow that is not a --shadow token
 *   outline-none     a rule that removes the outline and sets no border-color
 *                    or box-shadow to replace it
 *   em-dash          an em dash anywhere in src
 *   middot           a middot separator anywhere in src
 *   banned-word      a carta-design banned word in the English strings
 *   motion-effect    marquee or parallax in a stylesheet or component
 *   font-literal     a font-family (or JSX fontFamily) whose value is not one
 *                    of the three type tokens, var(--display), var(--ui),
 *                    var(--mono), or inherit; and inside :root, a custom
 *                    property other than those three that names a typeface.
 *                    This is the T198 typography decision: Fraunces for
 *                    display, Plus Jakarta Sans for everything else,
 *                    JetBrains Mono for measured facts. No Cormorant Garamond,
 *                    no Instrument Sans, no IBM Plex Mono, no face by name.
 *
 * styles.css already carries hundreds of old violations, so the detector is
 * baseline based: scripts/ci/design-lint.baseline.json records how many times
 * each (rule, file, line text) occurs today, and the run fails only when a key
 * occurs MORE often than that. Moving a line does not matter, editing one into
 * a violation does. Fixing violations never fails; run with --update-baseline
 * to shrink the baseline after a clean-up.
 *
 * Usage:
 *   node scripts/ci/design-lint.mjs                    check src against the baseline
 *   node scripts/ci/design-lint.mjs --update-baseline  rewrite the baseline
 *   node scripts/ci/design-lint.mjs --root DIR --baseline FILE   scan another tree
 *   node scripts/ci/design-lint.mjs --self-test        prove it fails on a seeded fixture
 *
 * Not part of `npm run ci`; it runs from .github/workflows/design-lint.yml.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

const BANNED_WORDS = ['seamless', 'seamlessly', 'unlock', 'effortless', 'effortlessly', 'elevate', 'leverage', 'empower', 'curated', 'simply', 'just', 'easy'];
const bannedRe = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'i');

// T198: the only legal values of a font-family declaration outside :root.
const FONT_TOKENS = /^(inherit|var\(\s*--(display|ui|mono)\s*\))$/;
// A :root custom property that names a typeface: a quoted family or a generic family keyword.
const FACE_VALUE = /\b(serif|sans-serif|monospace|cursive|fantasy|system-ui)\b|['"][^'"]+['"]\s*,/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|js|jsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Blank out /* ... */ comments but keep newlines, so line numbers hold.
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

function scanFile(abs, rel) {
  const found = [];
  const raw = fs.readFileSync(abs, 'utf8');
  const isCss = rel.endsWith('.css');
  const isEnStrings = /(^|\/)i18n\/en\.js$/.test(rel);
  const rawLines = raw.split('\n');
  const lines = isCss ? stripCssComments(raw).split('\n') : rawLines;
  const add = (rule, i, detail) => found.push({ rule, file: rel, line: i + 1, text: rawLines[i].trim().replace(/\s+/g, ' ').slice(0, 200), detail });

  let depth = 0;
  let rootDepth = -1; // brace depth at which a :root block opened, or -1
  let block = null; // current declaration block for the outline check
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('—')) add('em-dash', i);
    if (l.includes('·')) add('middot', i);
    if (isEnStrings && bannedRe.test(l.replace(/^\s*[\w$]+\s*:\s*/, ''))) add('banned-word', i, l.match(bannedRe)[1]);
    if (/\b(marquee|parallax)\b/i.test(l)) add('motion-effect', i);
    const ff = l.match(/\bfont-?[fF]amily\s*:\s*([^;}\n]*)/);
    if (ff) {
      const value = ff[1].trim().replace(/\s*!important\s*$/, '').replace(/,\s*$/, '').replace(/^(['"`])(.*)\1$/, '$2').trim();
      if (!FONT_TOKENS.test(value)) add('font-literal', i, value.slice(0, 60));
    }
    if (!isCss) continue;

    if (/^\s*:root\b[^{]*\{/.test(l) && rootDepth < 0) rootDepth = depth;
    const inRoot = rootDepth >= 0;
    const tok = inRoot && l.match(/(?:^|[{;])\s*--([\w-]+)\s*:\s*([^;}]*)/);
    if (tok && !/^(display|ui|mono)$/.test(tok[1]) && FACE_VALUE.test(tok[2])) add('font-literal', i, '--' + tok[1]);
    if (!inRoot && /#[0-9a-fA-F]{3,8}\b/.test(l.replace(/url\([^)]*\)/g, ''))) add('hex-literal', i);
    if (/-gradient\s*\(/.test(l)) add('gradient', i);
    const sh = l.match(/(?:box|text)-shadow\s*:\s*([^;}]*)/);
    if (sh && !/^\s*(none|inherit|initial|unset)\b/.test(sh[1]) && !/var\(\s*--shadow/.test(sh[1]) && !/^\s*var\(/.test(sh[1])) add('shadow-literal', i);

    // outline check: collect each innermost block, judge it when it closes
    for (const ch of l) {
      if (ch === '{') { depth++; block = { start: i, text: '' }; }
      else if (ch !== '}' && block) block.text += ch;
      else if (ch === '}') {
        depth--;
        if (block) {
          if (/outline\s*:\s*(none|0)\b/.test(block.text) && !/border-color|box-shadow/.test(block.text)) add('outline-none', block.start);
          block = null;
        }
        if (rootDepth >= 0 && depth <= rootDepth) rootDepth = -1;
      }
    }
    if (block) block.text += ' ';
  }
  return found;
}

export function scan(root) {
  const src = fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src') : root;
  const all = [];
  for (const abs of walk(src)) all.push(...scanFile(abs, path.relative(root, abs).split(path.sep).join('/')));
  return all;
}

const keyOf = (v) => `${v.rule}|${v.file}|${v.text}`;
const tally = (vs) => { const m = {}; for (const v of vs) m[keyOf(v)] = (m[keyOf(v)] || 0) + 1; return m; };

function check(root, baselineFile) {
  const found = scan(root);
  const base = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')).counts : {};
  const seen = {};
  const fresh = [];
  for (const v of found) {
    const k = keyOf(v);
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > (base[k] || 0)) fresh.push(v);
  }
  return { found, fresh, base };
}

function selfTest() {
  const fx = path.join(here, 'fixtures', 'design-lint');
  const empty = path.join(fx, 'empty-baseline.json');
  const bad = check(path.join(fx, 'bad'), empty);
  const rules = new Set(bad.fresh.map((v) => v.rule));
  const want = ['hex-literal', 'gradient', 'shadow-literal', 'outline-none', 'em-dash', 'middot', 'banned-word', 'motion-effect', 'font-literal'];
  const missing = want.filter((r) => !rules.has(r));
  const good = check(path.join(fx, 'good'), empty);
  let ok = true;
  if (missing.length) { console.error('self-test: rules that did not fire on the seeded fixture: ' + missing.join(', ')); ok = false; }
  if (good.fresh.length) { console.error('self-test: the clean fixture produced violations: ' + good.fresh.map((v) => v.rule).join(', ')); ok = false; }
  if (ok) console.log(`self-test ok: ${bad.fresh.length} seeded violations across ${rules.size} rules caught, clean fixture silent`);
  process.exit(ok ? 0 : 1);
}

if (args.includes('--self-test')) selfTest();

const root = path.resolve(opt('--root', appRoot));
const baselineFile = path.resolve(opt('--baseline', path.join(here, 'design-lint.baseline.json')));

if (args.includes('--update-baseline')) {
  const found = scan(root);
  const counts = tally(found);
  const byRule = {};
  for (const v of found) byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  fs.writeFileSync(baselineFile, JSON.stringify({ note: 'Counts of known design-lint violations by rule|file|line text. Regenerate with --update-baseline after fixing some; never to admit new ones.', total: found.length, byRule, counts }, null, 1) + '\n');
  console.log(`baseline written: ${found.length} known violations`, byRule);
  process.exit(0);
}

const { found, fresh } = check(root, baselineFile);
console.log(`design-lint: ${found.length} violations found, ${found.length - fresh.length} in the baseline, ${fresh.length} new`);
if (fresh.length) {
  for (const v of fresh) console.error(`${v.file}:${v.line}  ${v.rule}${v.detail ? ` (${v.detail})` : ''}  ${v.text}`);
  console.error('\nNew design violations. Use a token from DESIGN.md or fix the copy. Do not add to the baseline.');
  process.exit(1);
}
