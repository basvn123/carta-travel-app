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
 * Different specificity, or no shared property, cannot flip a win.
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
};
/** Sheets that already load after the main sheet, in no fixed order. */
const LATE = ['src/styles/70-mytrips.css', 'src/styles/71-pass.css', 'src/styleguide/styleguide.css', 'node_modules/maplibre-gl/dist/maplibre-gl.css'];
/** Chunks of strings, not class names: the locales and the vendor libraries. */
const STRINGS = /^(i18n|nl|de|fr|es|it|maplibre-gl|jspdf\.es\.min|purify\.es|html2canvas|index\.es)-/;

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
function subjectOf(sel) {
  const last = sel.trim().replace(/::?[\w-]+(\([^)]*\))?/g, '').split(/[\s>+~]+/).pop() || '';
  return { tag: (last.match(/^[a-z][\w-]*/) || [''])[0], cls: classesIn(last) };
}
const within = (x, y) => x.every((t) => y.includes(t));
/** Could one element match both? Only two different tags, or two class sets
 *  neither of which holds the other, rule it out. */
function couldMeet(a, b) {
  if (a.tag && b.tag && a.tag !== b.tag) return false;
  if (a.cls.length && b.cls.length) return within(a.cls, b.cls) || within(b.cls, a.cls);
  return true;
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
/** b could override a, where a moved after it: same element, same weight, a shared property. */
function overrides(b, a) {
  if (!couldMeet(a.subj, b.subj)) return false;
  for (const p of a.props) {
    if (!b.props.has(p)) continue;
    if (a.imp.has(p) !== b.imp.has(p)) continue; // !important against normal: importance decides, not order
    if (a.spec === b.spec) return true;
  }
  return false;
}

// ── The sheets ──
const MAIN = fs.readFileSync(path.join(APP, 'src/styles.css'), 'utf8');
const order = [...MAIN.matchAll(/@import '\.\/styles\/([^']+)'/g)].map((m) => m[1]);
const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
const files = order.map((file, fi) => { const src = read(`src/styles/${file}`); const root = postcss.parse(src, { from: file }); return { file, fi, src, root, list: entriesOf(root, { fi, fam: null }) }; });
const late = LATE.filter((rel) => fs.existsSync(path.join(APP, rel))).flatMap((rel) => entriesOf(postcss.parse(read(rel)), { fi: Infinity, fam: null }));

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
for (const e of pool) if (Number.isFinite(e.fi)) e.fam = familyOf(e.sel);
const keyOf = (s) => (s.cls.length ? s.cls.map((c) => `.${c}`) : [s.tag || '*']);
const index = new Map();
pool.forEach((e, i) => { for (const k of keyOf(e.subj)) { if (!index.has(k)) index.set(k, []); index.get(k).push(i); } });
const classless = [...index].filter(([k]) => !k.startsWith('.')).flatMap(([, ids]) => ids);
const rivalsOf = (s) => {
  if (!s.cls.length) return pool.map((_, i) => i);
  const set = new Set(classless); for (const c of s.cls) for (const i of index.get(`.${c}`) || []) set.add(i);
  return [...set];
};
let kept = 0;
const settle = () => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of pool) {
      if (!a.fam) continue;
      for (const i of rivalsOf(a.subj)) {
        const b = pool[i];
        if (b === a || (b.fam && b.fam === a.fam) || b.fi < a.fi) continue;
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
