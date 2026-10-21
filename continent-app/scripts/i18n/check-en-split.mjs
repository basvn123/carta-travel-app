// T480: after a build, prove the English split is safe: no eager chunk names a lazy key, the rest chunk is
// not in the first-paint set, and every lazy chunk that names a key imports the rest.
// Usage: node scripts/i18n/check-en-split.mjs . <dist>
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [app, dist] = process.argv.slice(2);
const { splitEnglish } = await import(pathToFileURL(path.join(app, 'scripts/i18n/enSplit.mjs')).href);
const { eager, rest } = await splitEnglish(app);
const A = path.join(dist, 'assets');
const files = fs.readdirSync(A).filter((f) => f.endsWith('.js'));
const code = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(A, f), 'utf8')]));
const imports = (f) => [...code[f].matchAll(/(?:import|from)\s*["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1]);
const closure = (f, s = new Set()) => { if (s.has(f) || !code[f]) return s; s.add(f); imports(f).forEach((d) => closure(d, s)); return s; };
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const eagerFiles = new Set();
for (const m of html.matchAll(/assets\/([\w.-]+\.js)/g)) closure(m[1], eagerFiles);
const restFile = files.find((f) => f.includes('carta-en-rest'));
const langFiles = new Set(files.filter((f) => /^(nl|de|fr|es|it)-/.test(f)));
console.log('rest chunk', restFile, 'eager?', eagerFiles.has(restFile));
const enFile = [...eagerFiles].find((f) => code[f].includes('"shell.tagline":'));
console.log('eager strings chunk', enFile);
const TOK = /[A-Za-z][\w-]*(?:\.[\w-]+)+/g;
let bad = 0;
for (const f of eagerFiles) {
  if (f === enFile) continue;
  for (const [t] of code[f].matchAll(TOK)) if (rest[t] !== undefined) { bad++; console.log('EAGER CHUNK NAMES LAZY KEY', f, t); }
}
let lazyBad = 0;
for (const f of files) {
  if (eagerFiles.has(f) || f === restFile || langFiles.has(f)) continue;
  const named = [...code[f].matchAll(TOK)].map((m) => m[0]).filter((t) => rest[t] !== undefined);
  if (named.length && !closure(f).has(restFile)) { lazyBad++; console.log('LAZY CHUNK WITHOUT REST', f, named.slice(0, 3)); }
}
let lazyNaming = files.filter((f) => !eagerFiles.has(f) && f !== restFile && !langFiles.has(f) && [...code[f].matchAll(TOK)].some((m) => rest[m[0]] !== undefined)).length;
console.log({ eagerFiles: eagerFiles.size, lazyNaming, eagerKeys: Object.keys(eager).length, restKeys: Object.keys(rest).length, bad, lazyBad });
