#!/usr/bin/env node
/**
 * CSS per route (T474, roadmap 1.2, row T435-f; plan requirement 15).
 *
 * The app's stylesheet loads in full before the first paint. Most of the trip
 * and day planners' rules, and the admin page's, style screens a first visit
 * never opens, so this moves those rules into sheets that load with their
 * route's chunk, and proves the move cannot change what any screen looks like.
 *
 *   node scripts/css-routes.mjs --split <dist/assets>   move the rules (writes src/styles)
 *   node scripts/css-routes.mjs --check <dist/assets>   prove the split still holds (CI)
 *   node scripts/css-routes.mjs --check <dist/assets> --hold
 *       move every route rule --check flags into src/styles/<family>-held.css,
 *       loaded last in the main sheet (T481), so the proof holds again
 *
 * Both read a real build's JavaScript chunks, because which classes a route
 * renders is a fact of the bundle, not of a file name.
 *
 * A selector belongs to a route family when one of its classes is named only
 * by chunks that the family's lazy entries alone reach (never the eager entry,
 * never another route). Such a rule cannot match anything before the route
 * loads, and its sheet loads before the route's code runs (Vite preloads a
 * lazy chunk's CSS with it), so taking it out of the first paint is safe.
 *
 * Moving it is safe for the cascade only if nothing that came after it in the
 * single sheet could override it. A route sheet loads after the main sheet,
 * so a moved rule now comes after every global rule. A rule stays global when
 * any rule it could have lost to (anything in its own file, which once split
 * no longer records the order inside it, every later file, the sheets the app
 * already loads lazily, maplibre-gl.css, and another family's route rules,
 * whose order against this one depends on what loaded first) could hit the
 * same element with the same specificity and set a property it sets.
 * Different specificity, or no shared property, cannot flip a win. A
 * shorthand shares its longhands (margin and margin-top, gap and column-gap),
 * and two different class sets can sit on one element whenever a selector,
 * a className expression or a class built from parts (`itrack-${size}`) puts
 * them together (T481, after a browser diff caught all three).
 *
 * Classes the bundle never names as a whole word (built at runtime from parts)
 * are treated as unknown, so a selector anchored only by them stays global.
 *
 * Split writes, per family, src/styles/<family>/<file> (that file's route
 * rules, in source order, media wrappers kept) and src/styles/<family>.css
 * (the family's entry, @import in the main sheet's order), and removes the
 * moved rules from src/styles/<file>. The route's entry modules import the
 * family sheet. Run it again after the next migration: it adds to the parts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(APP, 'package.json'));
const postcss = req('postcss');

/** The route families: their lazy entries (chunk names) and who they serve. */
export const FAMILIES = {
  planners: { roots: ['TripPlannerTab', 'DayPlannerTab'], who: 'the trip and day planners' },
  admin: { roots: ['AdminPage'], who: 'the admin page' },
  items: { roots: ['StubPage', 'TrailPage', 'BeachPage', 'LakePage', 'MountainPage', 'CyclePage', 'TripPage', 'JourneyPage'], who: 'the item pages' },
};
/** Sheets that already load after the main sheet, in no fixed order. */
const LATE = ['src/styles/70-mytrips.css', 'src/styles/71-pass.css', 'src/styleguide/styleguide.css', 'node_modules/maplibre-gl/dist/maplibre-gl.css'];
/** Chunks of strings, not class names: the locales (with the lazy English rest, T480) and the vendor libraries. */
const STRINGS = /^(i18n|nl|de|fr|es|it|_virtual_carta-en-rest|maplibre-gl|jspdf\.es\.min|purify\.es|html2canvas|index\.es)-/;

const args = process.argv.slice(2);
const mode = args.includes('--split') ? 'split' : args.includes('--check') ? 'check' : null;
const dist = args[args.indexOf(`--${mode}`) + 1];
const MIN = Number((args.find((a) => a.startsWith('--min=')) || '--min=1024').slice(6));
if (!mode || !dist || !fs.existsSync(dist)) {
  console.error('usage: node scripts/css-routes.mjs --split|--check <dist/assets> [--min=1024]');
  process.exit(2);
}

// ── The bundle: which chunks are eager, which lazy entries reach the rest ──
const chunkName = (f) => f.replace(/-[\w-]{8}\.js$/, '');
const all = fs.readdirSync(dist).filter((f) => f.endsWith('.js'));
const text = Object.fromEntries(all.map((f) => [f, fs.readFileSync(path.join(dist, f), 'utf8')]));
const staticImports = (f) => [...text[f].matchAll(/(?:^|[;\n}])\s*import\s*(?:[\w${},\s*]+from\s*)?["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]);
const lazyEntries = new Set(all.flatMap((f) => [...text[f].matchAll(/import\(\s*[`"']\.\/([\w.-]+\.js)[`"']\s*\)/g)].map((m) => m[1])));
const closure = (r) => {
  const seen = new Set(); const stack = [r];
  while (stack.length) { const f = stack.pop(); if (seen.has(f) || !text[f]) continue; seen.add(f); stack.push(...staticImports(f)); }
  return seen;
};
const entry = all.find((f) => /^index-[\w-]+\.js$/.test(f));
if (!entry) { console.error(`no index chunk in ${dist}`); process.exit(2); }
const eager = closure(entry);
const reachedBy = new Map();
for (const r of lazyEntries) for (const c of closure(r)) {
  if (eager.has(c)) continue;
  if (!reachedBy.has(c)) reachedBy.set(c, new Set());
  reachedBy.get(c).add(chunkName(r));
}
const scanned = all.filter((f) => !STRINGS.test(f));
const tokenRoots = new Map();
/** The lazy entries that can render a class, or null (eager, or never named). */
function rootsOf(token) {
  if (tokenRoots.has(token)) return tokenRoots.get(token);
  const re = new RegExp(`(?<![\\w-])${token.replace(/-/g, '\\-')}(?![\\w-])`);
  const hits = scanned.filter((f) => text[f].includes(token) && re.test(text[f]));
  let out = null;
  if (hits.length && hits.every((f) => !eager.has(f))) {
    out = new Set(); for (const f of hits) for (const r of reachedBy.get(f) || []) out.add(r);
    if (!out.size) out = null;
  }
  tokenRoots.set(token, out);
  return out;
}
const classesIn = (sel) => [...sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
function familyOf(sel) {
  for (const [fam, { roots }] of Object.entries(FAMILIES)) {
    if (classesIn(sel).some((t) => { const r = rootsOf(t); return r && [...r].every((x) => roots.includes(x)); })) return fam;
  }
  return null;
}

// ── Selectors: exact specificity, the subject, what a rule sets ──
const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
function specificity(s) {
  let a = 0, b = 0, c = 0; let i = 0;
  const add = (x) => { a += x[0]; b += x[1]; c += x[2]; };
  const gt = (x, m) => x[0] > m[0] || (x[0] === m[0] && (x[1] > m[1] || (x[1] === m[1] && x[2] > m[2])));
  const maxOf = (list) => splitTop(list).map((x) => specificity(x.trim())).reduce((m, x) => (gt(x, m) ? x : m), [0, 0, 0]);
  const readParen = () => { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { d--; if (!d) break; } } const inner = s.slice(i + 1, j); i = j + 1; return inner; };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#') { a++; i++; while (i < s.length && /[\w-]/.test(s[i])) i++; }
    else if (ch === '.') { b++; i++; while (i < s.length && /[\w-]/.test(s[i])) i++; }
    else if (ch === '[') { b++; while (i < s.length && s[i] !== ']') i++; i++; }
    else if (ch === ':') {
      const el = s[i + 1] === ':'; i += el ? 2 : 1; let n = ''; while (i < s.length && /[\w-]/.test(s[i])) n += s[i++];
      const arg = s[i] === '(' ? readParen() : null;
      if (el || ['before', 'after', 'first-line', 'first-letter'].includes(n)) c++;
      else if (n === 'where') { /* adds nothing */ }
      else if (['is', 'not', 'has', 'matches'].includes(n)) add(maxOf(arg || ''));
      else if (/^nth-(last-)?child$/.test(n) && arg && / of /.test(arg)) { b++; add(maxOf(arg.split(/ of /)[1])); }
      else b++;
    } else if (/[a-zA-Z]/.test(ch)) { c++; while (i < s.length && /[\w-]/.test(s[i])) i++; }
    else i++;
  }
  return [a, b, c].join(',');
}
/** The selector as compounds and the combinator before each. `c` is the
 *  compound with the insides of attribute tests and functional pseudo-classes
 *  blanked, so a class named only inside :not(), :is() or :has() is never read
 *  as required; `raw` keeps them. */
function compoundsOf(sel) {
  const out = []; let comb = ' '; let cur = ''; let d = 0;
  const push = () => { if (cur) { out.push({ raw: cur, comb }); comb = ' '; cur = ''; } };
  for (const ch of sel.trim()) {
    if (ch === '(' || ch === '[') d++;
    if (ch === ')' || ch === ']') d--;
    if (!d && /[\s>+~]/.test(ch)) { push(); if (ch !== ' ' && !/\s/.test(ch)) comb = ch; continue; }
    cur += ch;
  }
  push();
  for (const x of out) {
    let c = x.raw.replace(/\[[^\]]*\]/g, '[]');
    for (let prev = ''; prev !== c;) { prev = c; c = c.replace(/\([^()]*\)/g, ''); }
    x.c = c;
  }
  return out;
}
/** The box a compound styles: its pseudo-element, or '' for the element itself. */
const pseudoOf = (c) => (c.match(/::[\w-]+|:(?:before|after|first-line|first-letter)(?![\w-])/) || [''])[0].replace(/^:(?!:)/, '::');
/** A subject's possible shapes. A :where() or :is() on the subject whose
 *  arguments are plain tags and classes names what the element must also be,
 *  one of them, so `.list > :where(.row, .trip)` styles only rows and trips,
 *  at the specificity of `.list > *`. */
function altsOf(raw, tag, cls) {
  let alts = [{ tag, cls }];
  for (const m of raw.matchAll(/:(?:where|is)\(([^()]*)\)/g)) {
    const opts = m[1].split(',').map((x) => x.trim());
    if (!opts.every((o) => /^([a-z][\w-]*)?(\.[\w-]+)+$|^[a-z][\w-]*$/.test(o))) continue;
    alts = alts.flatMap((a) => opts.flatMap((o) => {
      const t = (o.match(/^[a-z][\w-]*/) || [''])[0];
      return a.tag && t && t !== a.tag ? [] : [{ tag: t || a.tag, cls: [...a.cls, ...classesIn(o)] }];
    }));
  }
  return alts;
}
function subjectOf(sel) {
  const cs = compoundsOf(sel);
  const subj = cs.length ? cs[cs.length - 1] : { raw: '', c: '' };
  const last = subj.c.replace(/::?[\w-]+/g, '');
  // anchors: classes on the subject or on an ancestor of it, that is every
  // compound with a descendant or child combinator between it and the subject.
  // A compound tied to the subject only by + or ~ is a sibling and is left out.
  const anchors = []; let ancestor = false;
  for (let i = cs.length - 1; i >= 0; i--) {
    if (i === cs.length - 1 || ancestor) anchors.push(...classesIn(cs[i].c));
    if (cs[i].comb === ' ' || cs[i].comb === '>') ancestor = true;
  }
  const tag = (last.match(/^[a-z][\w-]*/) || [''])[0]; const cls = classesIn(last);
  return { tag, cls, alts: altsOf(subj.raw, tag, cls), pseudo: pseudoOf(subj.c), anchors };
}
const within = (x, y) => x.every((t) => y.includes(t));
/** Could one element match both? Only two different tags, or two class sets
 *  neither of which holds the other, rule it out, for every pair of shapes. */
function couldMeet(a, b) {
  // A pseudo-element is its own box: a ::placeholder or ::before rule only
  // competes with rules on the same pseudo-element, never with the element's.
  if (a.pseudo !== b.pseudo) return false;
  return a.alts.some((x) => b.alts.some((y) => shapesMeet(x, y)));
}
function shapesMeet(a, b) {
  if (a.tag && b.tag && a.tag !== b.tag) return false;
  if (a.cls.length && b.cls.length) {
    if (within(a.cls, b.cls) || within(b.cls, a.cls)) return true;
    // Two different class sets meet on one element only if every class of
    // the one can sit beside every class of the other.
    return a.cls.every((x) => b.cls.includes(x) || b.cls.every((y) => a.cls.includes(y) || cooccur(x, y)));
  }
  return true;
}
/** Which classes can share an element. Evidence: a compound selector that
 *  names both; one className expression in the bundle that names both (every
 *  string in it, branches of a choice included); and a class list with a bare
 *  value in it (`card ${className}`, [..].filter(Boolean).join(' ')), which
 *  takes any class some caller passes to a component as className. */
let co = null; let open = null; let passed = null;
function cooccur(x, y) {
  if (!co) buildCo();
  const X = keysOf(x); const Y = keysOf(y);
  return X.some((a) => Y.some((b) => a === b || co.get(a)?.has(b) || (open.has(a) && passed.has(b)) || (open.has(b) && passed.has(a))));
}
/** Prefixes className expressions finish at runtime (`itrack-${size}`), kept
 *  in the evidence as 'itrack-*'. */
let partPrefixes = null;
const PREFIX = /([A-Za-z_][\w-]*-)(?:\$\{|[`"']\s*\+)/g;
/** The evidence keys that stand for a class: itself when the bundle names it
 *  whole; a prefix key when a className expression builds it from parts and
 *  the rest of the name exists as a string of its own (size = 'third'); none
 *  when no code can put it on an element. */
function keysOf(token) {
  if (namedWhole(token)) return [token];
  const out = [];
  for (let i = token.indexOf('-'); i > 0; i = token.indexOf('-', i + 1)) {
    const p = token.slice(0, i + 1);
    if (partPrefixes.has(p) && isStringSomewhere(token.slice(i + 1))) out.push(`${p}*`);
  }
  return out;
}
const strMemo = new Map();
function isStringSomewhere(s) {
  if (!strMemo.has(s)) strMemo.set(s, scanned.some((f) => text[f].includes(s) && ['`', '"', "'"].some((q) => text[f].includes(q + s + q))));
  return strMemo.get(s);
}
const wholeMemo = new Map();
function namedWhole(token) {
  if (!wholeMemo.has(token)) {
    const re = new RegExp(`(?<![\\w-])${token.replace(/-/g, '\\-')}(?![\\w-])`);
    wholeMemo.set(token, scanned.some((f) => text[f].includes(token) && re.test(text[f])));
  }
  return wholeMemo.get(token);
}
/** The JavaScript expression starting at i, up to a top-level , ) or }: its
 *  string texts and whether it holds a bare value (a hole or the whole). */
function readExpr(t, i) {
  const strs = []; let bare = false; let d = 0; let j = i; let cur = '';
  const start = j;
  const readTemplate = () => { // t[j] is a backtick
    let s = ''; j++;
    while (j < t.length && t[j] !== '`') {
      if (t[j] === '\\') { s += t[j + 1]; j += 2; continue; }
      if (t[j] === '$' && t[j + 1] === '{') {
        j += 2; const h0 = j; const inner = readUntilBrace();
        const hole = t.slice(h0, j).trim(); if (/^[\w$.]+$/.test(hole)) bare = true;
        strs.push(...inner); j++; s += ' '; continue;
      }
      s += t[j++];
    }
    j++; strs.push(s);
  };
  const readQuoted = (q) => { let s = ''; j++; while (j < t.length && t[j] !== q) { if (t[j] === '\\') j++; s += t[j++]; } j++; strs.push(s); };
  const readUntilBrace = () => { // inside ${...}: up to the matching }
    const before = strs.length; let dd = 0;
    while (j < t.length) {
      const ch = t[j];
      if (ch === '`') { readTemplate(); continue; }
      if (ch === '"' || ch === "'") { readQuoted(ch); continue; }
      if (ch === '{' || ch === '(' || ch === '[') dd++;
      if (ch === '}' || ch === ')' || ch === ']') { if (!dd) break; dd--; }
      j++;
    }
    return strs.splice(before);
  };
  while (j < t.length && j - start < 2000) {
    const ch = t[j];
    if (ch === '`') { readTemplate(); continue; }
    if (ch === '"' || ch === "'") { readQuoted(ch); continue; }
    if (ch === '{' || ch === '(' || ch === '[') d++;
    if (ch === '}' || ch === ')' || ch === ']' || ch === ',') { if (!d) break; if (ch !== ',') d--; }
    cur += ch; j++;
  }
  const outside = t.slice(start, j).replace(/`[^`]*`|"[^"]*"|'[^']*'/g, '').trim();
  if (/^[\w$.]+$/.test(outside) || /\+\s*[\w$.]+|[\w$.]+\s*\+/.test(outside)) bare = true;
  return { strs, bare, end: j };
}
function buildCo() {
  co = new Map(); open = new Set(); passed = new Set(); partPrefixes = new Set();
  const pair = (x, y) => { if (x === y) return; if (!co.has(x)) co.set(x, new Set()); if (!co.has(y)) co.set(y, new Set()); co.get(x).add(y); co.get(y).add(x); };
  const known = new Set();
  const sheets = [...files.flatMap((f) => f.list), ...late];
  for (const fam of Object.keys(FAMILIES)) {
    const dir = path.join(APP, 'src/styles', fam);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((x) => x.endsWith('.css'))) sheets.push(...entriesOf(postcss.parse(fs.readFileSync(path.join(dir, file), 'utf8')), {}));
  }
  for (const e of sheets) for (const c of compoundsOf(e.sel)) {
    const cls = classesIn(c.raw); cls.forEach((t) => known.add(t));
    for (let i = 0; i < cls.length; i++) for (let j = i + 1; j < cls.length; j++) pair(cls[i], cls[j]);
  }
  const word = /[A-Za-z_][\w-]*/g;
  const namesIn = (strs) => [...new Set(strs.flatMap((x) => [...x.matchAll(word)].map((w) => w[0])).filter((w) => known.has(w)))];
  const prefixesIn = (src) => [...src.matchAll(PREFIX)].map((p) => { partPrefixes.add(p[1]); return `${p[1]}*`; });
  const group = (names) => { for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pair(names[i], names[j]); };
  for (const f of scanned) {
    const t = text[f];
    for (const m of t.matchAll(/className:/g)) {
      const { strs, bare, end } = readExpr(t, m.index + 10);
      const names = [...namesIn(strs), ...prefixesIn(t.slice(m.index + 10, end))]; group(names);
      if (bare) names.forEach((n) => open.add(n));
      const call = t.lastIndexOf('.jsx', m.index); const callS = t.lastIndexOf('.jsxs', m.index);
      const at = Math.max(call, callS);
      if (at >= 0 && m.index - at < 1500) {
        const arg = t.slice(at, at + 12).replace(/^\.jsxs?\)\(/, '');
        if (/^[A-Za-z_$]/.test(arg)) names.forEach((n) => passed.add(n));
      }
    }
    for (const m of t.matchAll(/\[([^[\]]{0,600})\]\.filter\(Boolean\)\.join\(/g)) {
      const names = [...namesIn([...m[1].matchAll(/["'`]([^"'`]*)["'`]/g)].map((s) => s[1])), ...prefixesIn(m[1])];
      group(names); names.forEach((n) => open.add(n));
    }
  }
}
function entriesOf(root, extra) {
  const out = [];
  root.walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes/i.test(r.parent.name)) return;
    const props = new Set(); const imp = new Set();
    r.walkDecls((d) => { props.add(d.prop); if (d.important) imp.add(d.prop); });
    r.selectors.forEach((sel, k) => out.push({ r, k, sel, props, imp, spec: specificity(sel), subj: subjectOf(sel), ...extra }));
  });
  return out;
}
/** The lazy entries a route entry mounts, at any depth (its chunks' import() calls). */
const dynMemo = new Map();
const dynOf = (f) => dynMemo.get(f) || dynMemo.set(f, [...text[f].matchAll(/import\(\s*[`"']\.\/([\w.-]+\.js)[`"']\s*\)/g)].map((m) => m[1])).get(f);
const mountsMemo = new Map();
function mounts(rootName) {
  if (mountsMemo.has(rootName)) return mountsMemo.get(rootName);
  const out = new Set(); const seen = new Set();
  const stack = [...lazyEntries].filter((f) => chunkName(f) === rootName);
  while (stack.length) {
    const r = stack.pop(); if (seen.has(r)) continue; seen.add(r);
    for (const c of closure(r)) if (!eager.has(c)) for (const d of dynOf(c)) if (!eager.has(d) && !seen.has(d)) { out.add(chunkName(d)); stack.push(d); }
  }
  mountsMemo.set(rootName, out);
  return out;
}
/** Two routes' trees never nest unless one mounts the other: every route
 *  entry the eager App mounts gets its own tab or overlay. So when only the
 *  eager bundle imports a family's entries, an element only the family renders
 *  (or one inside it) is never an element only an unrelated route renders (or
 *  one inside that). A route the family mounts, such as TripPage inside the
 *  trip wizard, is not unrelated, and neither is one that mounts the family. */
const appOnlyMemo = new Map();
const fromAppOnly = (fam) => appOnlyMemo.get(fam) ?? appOnlyMemo.set(fam, FAMILIES[fam].roots.every((root) => all.every((f) => eager.has(f) || !dynOf(f).some((d) => chunkName(d) === root)))).get(fam);
const insideOf = new Map();
function apart(a, b) {
  if (!a.fam || !fromAppOnly(a.fam)) return false;
  const roots = FAMILIES[a.fam].roots;
  if (!insideOf.has(a.fam)) insideOf.set(a.fam, new Set([...roots, ...roots.flatMap((r) => [...mounts(r)])]));
  const inside = insideOf.get(a.fam);
  const aIn = a.subj.anchors.some((t) => { const r = rootsOf(t); return r && [...r].every((x) => roots.includes(x)); });
  const bOut = b.subj.anchors.some((t) => { const r = rootsOf(t); return r && [...r].every((x) => !inside.has(x) && ![...mounts(x)].some((m) => roots.includes(m))); });
  return aIn && bOut;
}
/** The longhands a property sets, so a shorthand and its longhands (margin and
 *  margin-top, gap and column-gap, font and line-height, margin-inline and
 *  margin-left) are read as the same property. */
const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const atomsMemo = new Map();
function atomsOf(prop) {
  if (atomsMemo.has(prop)) return atomsMemo.get(prop);
  let p = prop.toLowerCase();
  if (!p.startsWith('--')) p = p.replace(/^-(webkit|moz|ms)-/, '');
  const out = new Set([p]);
  const add = (...xs) => xs.forEach((x) => out.add(x));
  const logical = p.replace(/inline-start/, 'left').replace(/inline-end/, 'right').replace(/block-start/, 'top').replace(/block-end/, 'bottom');
  out.add(logical);
  let m;
  if ((m = p.match(/^(margin|padding|scroll-margin|scroll-padding|inset)-(inline|block)$/))) {
    const sides = m[2] === 'inline' ? ['left', 'right'] : ['top', 'bottom'];
    add(...sides.map((s) => (m[1] === 'inset' ? s : `${m[1]}-${s}`)));
  }
  if (/^(margin|padding|scroll-margin|scroll-padding)$/.test(p)) add(...SIDES.map((s) => `${p}-${s}`));
  if (p === 'inset') add(...SIDES);
  if (/^inset-(left|right|top|bottom)$/.test(logical)) add(logical.slice(6));
  if (p === 'border') add(...SIDES.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`]), 'border-image');
  if ((m = logical.match(/^border-(top|right|bottom|left)$/))) add(`${logical}-width`, `${logical}-style`, `${logical}-color`);
  if ((m = p.match(/^border-(inline|block)(-(width|style|color))?$/))) {
    const sides = m[1] === 'inline' ? ['left', 'right'] : ['top', 'bottom'];
    const kinds = m[3] ? [m[3]] : ['width', 'style', 'color'];
    add(...sides.flatMap((s) => kinds.map((k) => `border-${s}-${k}`)));
  }
  if ((m = p.match(/^border-(width|style|color)$/))) add(...SIDES.map((s) => `border-${s}-${m[1]}`));
  if (p === 'border-radius') add(...CORNERS.map((c) => `border-${c}-radius`));
  if (/^(grid-)?gap$/.test(p)) add('gap', 'row-gap', 'column-gap', 'grid-row-gap', 'grid-column-gap');
  if (p === 'grid-row-gap') add('row-gap'); if (p === 'grid-column-gap') add('column-gap');
  if (p === 'font') add('line-height');
  if ((m = p.match(/^place-(items|content|self)$/))) add(`align-${m[1]}`, `justify-${m[1]}`);
  if (p === 'overflow') add('overflow-x', 'overflow-y');
  if (p === 'overflow-inline') add('overflow-x'); if (p === 'overflow-block') add('overflow-y');
  if (/^(inline-size|min-inline-size|max-inline-size)$/.test(p)) add(p.replace('inline-size', 'width'));
  if (/^(block-size|min-block-size|max-block-size)$/.test(p)) add(p.replace('block-size', 'height'));
  const list = [...out];
  atomsMemo.set(prop, list);
  return list;
}
/** Do two properties set a longhand in common? Equal atoms, or one atom the
 *  family of the other (font and font-size, background and background-color). */
function propsMeet(p, q) {
  const A = atomsOf(p); const B = atomsOf(q);
  return A.some((x) => B.some((y) => x === y || (!x.startsWith('--') && !y.startsWith('--') && (y.startsWith(`${x}-`) || x.startsWith(`${y}-`)))));
}
/** b could override a, where a moved after it: same element, same weight, a shared property. */
function overrides(b, a) {
  if (a.spec !== b.spec) return false;
  if (!couldMeet(a.subj, b.subj)) return false;
  if (apart(a, b)) return false;
  for (const p of a.props) for (const q of b.props) {
    if (a.imp.has(p) !== b.imp.has(q)) continue; // !important against normal: importance decides, not order
    if (propsMeet(p, q)) return true;
  }
  return false;
}

// ── The sheets ──
const MAIN = fs.readFileSync(path.join(APP, 'src/styles.css'), 'utf8');
const order = [...MAIN.matchAll(/@import '\.\/styles\/([^']+)'/g)].map((m) => m[1]);
const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
const files = order.map((file, fi) => { const src = read(`src/styles/${file}`); const root = postcss.parse(src, { from: file }); return { file, fi, src, root, list: entriesOf(root, { fi, fam: null }) }; });
const late = LATE.filter((rel) => fs.existsSync(path.join(APP, rel))).flatMap((rel) => entriesOf(postcss.parse(read(rel)), { fi: Infinity, fam: null }));

// ── Hold: route rules the cascade proof cannot clear go back to the first paint ──
// `--check <dist> --hold` moves every route rule --check would flag into
// src/styles/<family>-held.css, imported at the end of src/styles.css. There
// it still comes after every rule of the main sheet, exactly where its route
// sheet put it, so what any screen renders does not change; it only loads
// with the first paint again. Held rules keep their route-sheet order, and a
// rule that held rules could now override is held too, until nothing is left.
if (mode === 'check' && args.includes('--hold')) {
  const parsed = [];
  let rank = 0;
  for (const fam of Object.keys(FAMILIES)) {
    const entrySheet = path.join(APP, 'src/styles', `${fam}.css`);
    if (!fs.existsSync(entrySheet)) continue;
    const listed = [...fs.readFileSync(entrySheet, 'utf8').matchAll(/@import '\.\/[^/]+\/([^']+)'/g)].map((m) => m[1]);
    for (const file of listed) {
      const p = path.join(APP, 'src/styles', fam, file);
      const src = fs.readFileSync(p, 'utf8');
      const root = postcss.parse(src);
      const list = entriesOf(root, { fi: order.indexOf(file), fam, file: `${fam}/${file}` });
      for (const e of list) e.rank = rank++;
      parsed.push({ fam, file, p, src, root, list });
    }
  }
  const all = parsed.flatMap((x) => x.list);
  const globals = files.flatMap((f) => f.list);
  const held = new Set();
  const heldFi = order.length;
  for (let round = 0; round < 50; round++) {
    const route = all.filter((e) => !held.has(e));
    const heldList = all.filter((e) => held.has(e)).map((e) => ({ ...e, fi: heldFi, fam: null }));
    const flagged = route.filter((a) => [...globals.filter((b) => b.fi >= a.fi), ...heldList, ...late, ...route.filter((b) => b.fam !== a.fam)].some((b) => overrides(b, a)));
    if (!flagged.length) break;
    flagged.forEach((e) => held.add(e));
  }
  // Write: drop held selectors from their route files, build the held sheets.
  const nl = MAIN.includes('\r\n') ? '\r\n' : '\n';
  const out = {};
  for (const fam of Object.keys(FAMILIES)) out[fam] = postcss.root();
  const chainOf = (node) => { const c = []; for (let p = node.parent; p && p.type === 'atrule'; p = p.parent) c.unshift(p); return c; };
  for (const x of parsed) {
    const byRule = new Map();
    for (const e of x.list) if (held.has(e)) { if (!byRule.has(e.r)) byRule.set(e.r, []); byRule.get(e.r).push(e); }
    for (const e of x.list.filter((y) => held.has(y))) {
      // Rebuild the media chain around each held selector, in rank order.
      let target = out[x.fam];
      for (const at of chainOf(e.r)) {
        const last = target.last;
        if (last && last.type === 'atrule' && last.name === at.name && last.params === at.params) target = last;
        else { const c = at.clone({ nodes: [] }); target.append(c); target = c; }
      }
      target.append(e.r.clone({ selectors: [e.sel] }));
    }
    for (const [r, es] of byRule) {
      const keep = r.selectors.filter((s, k) => !es.some((e) => e.k === k));
      if (keep.length) r.selectors = keep; else { let p = r.parent; r.remove(); while (p && p.type === 'atrule' && !p.nodes.some((n) => n.type !== 'comment')) { const q = p.parent; p.remove(); p = q; } }
    }
    if (byRule.size) fs.writeFileSync(x.p, x.root.toString());
  }
  let mainText = MAIN;
  for (const [fam, root] of Object.entries(out)) {
    const sheet = path.join(APP, 'src/styles', `${fam}-held.css`);
    if (!root.nodes.length) continue;
    // Rules held by an earlier run came before the route sheet, so before these.
    if (fs.existsSync(sheet)) { fs.writeFileSync(sheet, `${fs.readFileSync(sheet, 'utf8').trimEnd()}${nl}${root.toString().replace(/^\s+/, '')}${nl}`); continue; }
    fs.writeFileSync(sheet, [
      `/* Rules only ${FAMILIES[fam].who} render that scripts/css-routes.mjs --hold`,
      `   keeps in the first paint: the cascade proof could not clear them for the`,
      `   route sheet. Imported last in src/styles.css, so each still comes after the`,
      `   whole main sheet as it did in src/styles/${fam}.css. Same order as there. */`,
      '', root.toString().replace(/^\s+/, ''), '',
    ].join(nl));
    const imp = `@import './styles/${fam}-held.css';`;
    if (!mainText.includes(imp)) mainText = mainText.replace(/\s*$/, `${nl}/* T481: route rules held in the first paint by css-routes --hold. */${nl}${imp}${nl}`);
  }
  fs.writeFileSync(path.join(APP, 'src/styles.css'), mainText);
  console.log(`css-routes: held ${held.size} route selectors in the first paint`);
  process.exit(0);
}

if (mode === 'check') {
  const problems = [];
  const routeEntries = [];
  for (const fam of Object.keys(FAMILIES)) {
    const dir = path.join(APP, 'src/styles', fam);
    if (!fs.existsSync(dir)) continue;
    const entrySheet = path.join(APP, 'src/styles', `${fam}.css`);
    const listed = fs.existsSync(entrySheet) ? [...fs.readFileSync(entrySheet, 'utf8').matchAll(/@import '\.\/[^/]+\/([^']+)'/g)].map((m) => m[1]) : [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
      const fi = order.indexOf(file);
      if (fi < 0) { problems.push(`${fam}/${file}: no global sheet of that name in src/styles.css`); continue; }
      if (!listed.includes(file)) problems.push(`${fam}/${file}: not imported by src/styles/${fam}.css`);
      const list = entriesOf(postcss.parse(fs.readFileSync(path.join(dir, file), 'utf8')), { fi, fam, file: `${fam}/${file}` });
      for (const e of list) if (familyOf(e.sel) !== fam) problems.push(`${fam}/${file}: "${e.sel}" is not ${fam}-only in this build; it belongs in src/styles/${file}`);
      routeEntries.push(...list);
    }
  }
  const globals = files.flatMap((f) => f.list);
  for (const a of routeEntries) {
    const rivals = [...globals.filter((b) => b.fi >= a.fi), ...late, ...routeEntries.filter((b) => b.fam !== a.fam)];
    const hit = rivals.find((b) => overrides(b, a));
    if (hit) problems.push(`${a.file}: "${a.sel}" loads after "${hit.sel}"${Number.isFinite(hit.fi) ? ` (${hit.file || order[hit.fi]})` : ''}, which could override it; move it back to src/styles/${order[a.fi]}`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`css-routes: ${p}`);
    console.error(`css-routes: ${problems.length} problem(s) in the route sheets`);
    process.exit(1);
  }
  console.log(`css-routes: ${routeEntries.length} route selectors checked against the build in ${dist}: all route-only, none overridable`);
  process.exit(0);
}

// ── Split ──
const pool = [...files.flatMap((f) => f.list), ...late];
for (const e of pool) if (Number.isFinite(e.fi)) e.fam = order[e.fi].endsWith('-held.css') ? null : familyOf(e.sel);
// Rules an earlier split already moved stay where they are, but they are
// rivals: a family's sheet and another's load in whichever order the routes do.
for (const fam of Object.keys(FAMILIES)) {
  const dir = path.join(APP, 'src/styles', fam);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((x) => x.endsWith('.css') && order.includes(x))) {
    pool.push(...entriesOf(postcss.parse(fs.readFileSync(path.join(dir, file), 'utf8')), { fi: order.indexOf(file), fam, fixed: true }));
  }
}
// Only a rule of the same specificity can win on order, so rivals are looked
// up by specificity (two classes can share an element without sharing a name).
const bySpec = new Map();
pool.forEach((e, i) => { if (!bySpec.has(e.spec)) bySpec.set(e.spec, []); bySpec.get(e.spec).push(i); });
const rivalsOf = (a) => bySpec.get(a.spec) || [];
let kept = 0;
const settle = () => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of pool) {
      if (!a.fam || a.fixed) continue;
      for (const i of rivalsOf(a)) {
        const b = pool[i];
        // A rule an earlier run moved into this family's part of the same
        // file now comes before the moving rule, whatever the order was.
        const sameSheet = b.fixed && b.fam === a.fam && b.fi === a.fi;
        if (b === a || (b.fam && b.fam === a.fam && !sameSheet) || (!b.fam && b.fi < a.fi)) continue;
        if (!overrides(b, a)) continue;
        a.fam = null; kept++; changed = true; break;
      }
    }
  }
};
// A file whose route part would be too small to be worth a sheet stays whole,
// so its rules are global after all: settle again with them global, until the
// set of files worth splitting no longer changes.
const sizeOfPart = (f, fam) => f.list.filter((e) => e.fam === fam).reduce((n, e) => n + e.sel.length + e.r.toString().length / Math.max(1, e.r.selectors.length), 0);
for (let round = 0; round < 10; round++) {
  settle();
  let reset = 0;
  for (const f of files) {
    const worth = Object.keys(FAMILIES).some((fam) => sizeOfPart(f, fam) >= MIN);
    if (!worth) for (const e of f.list) if (e.fam) { e.fam = null; reset++; }
  }
  if (!reset) break;
}
const famFor = new Map();
for (const f of files) for (const e of f.list) { if (!famFor.has(e.r)) famFor.set(e.r, []); famFor.get(e.r)[e.k] = e.fam; }
const report = []; const written = {};
for (const f of files) {
  const parts = {};
  let moved = 0;
  const walk = (container, target) => {
    container.each((node) => {
      if (node.type === 'rule') {
        const fams = famFor.get(node); if (!fams) return;
        const byFam = {}; const keep = [];
        node.selectors.forEach((sel, k) => { const fam = fams[k]; if (fam) (byFam[fam] ||= []).push(sel); else keep.push(sel); });
        for (const [fam, sels] of Object.entries(byFam)) { target(fam).append(node.clone({ selectors: sels })); moved += sels.length; }
        if (!keep.length) node.remove(); else if (Object.keys(byFam).length) node.selectors = keep;
      } else if (node.type === 'atrule' && ['media', 'supports', 'container'].includes(node.name) && node.nodes) {
        const sub = {};
        walk(node, (fam) => { if (!sub[fam]) { sub[fam] = node.clone({ nodes: [] }); target(fam).append(sub[fam]); } return sub[fam]; });
        if (!node.nodes.some((n) => n.type !== 'comment')) node.remove();
      }
    });
  };
  walk(f.root, (fam) => (parts[fam] ||= postcss.root()));
  const sizes = Object.fromEntries(Object.entries(parts).map(([fam, r]) => [fam, r.toString().length]));
  // Only files judged worth a part above still hold route rules.
  if (!Object.keys(parts).length) continue;
  const nl = f.src.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(path.join(APP, 'src/styles', f.file), f.root.toString());
  for (const [fam, r] of Object.entries(parts)) {
    const dir = path.join(APP, 'src/styles', fam); fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, f.file);
    const body = r.toString().replace(/^\s+/, '');
    if (fs.existsSync(out)) fs.appendFileSync(out, `${nl}${body}`);
    else {
      fs.writeFileSync(out, [
        `/* ${f.file}, the rules only ${FAMILIES[fam].who} render (T474, CSS per route).`,
        `   The rest of this domain stays in src/styles/${f.file}; a rule lives in one`,
        '   of the two, so edit it where it is. This sheet loads with the route\'s',
        '   chunk, after the main sheet, and holds only rules nothing later in the',
        '   cascade could override; scripts/css-routes.mjs --check proves it on a build. */',
        '',
      ].join(nl) + body);
    }
    (written[fam] ||= new Set()).add(f.file);
  }
  report.push({ file: f.file, moved, before: f.src.length, after: f.root.toString().length, ...sizes });
}
for (const [fam, set] of Object.entries(written)) {
  const entrySheet = path.join(APP, 'src/styles', `${fam}.css`);
  const have = fs.existsSync(entrySheet) ? [...fs.readFileSync(entrySheet, 'utf8').matchAll(/@import '\.\/[^/]+\/([^']+)'/g)].map((m) => m[1]) : [];
  const listed = order.filter((f) => set.has(f) || have.includes(f));
  fs.writeFileSync(entrySheet, [
    `/* The ${fam} route sheet (T474, CSS per route): the rules only ${FAMILIES[fam].who}`,
    '   render, split out of the main sheet by scripts/css-routes.mjs and imported by',
    `   the route's lazy entries, so they load with its chunk and not before the`,
    '   first paint. Same order as src/styles.css. */',
    '',
    ...listed.map((f) => `@import './${fam}/${f}';`),
    '',
  ].join('\r\n'));
}
console.table(report);
console.log(`moved ${report.reduce((n, r) => n + r.before - r.after, 0)} bytes of rules; ${kept} route rules kept global for the cascade`);
