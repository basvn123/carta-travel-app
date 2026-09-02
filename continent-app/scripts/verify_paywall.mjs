/**
 * verify_paywall.mjs, a static check that the paywall's copy has not drifted.
 *
 * The paywall spans four places that have no reason to stay in step on their
 * own: the reason codes in hooks/usePaywall.jsx, the copy map in
 * components/PassModal.jsx, the call sites that pass a reason string, and six
 * locale files. A typo in any one of them shows a traveller a blank heading at
 * the exact moment they were being asked for money, and nothing else in the
 * build would notice.
 *
 * No browser, no server, no dependencies. Run it from continent-app/:
 *
 *     node scripts/verify_paywall.mjs
 *
 * Exits non-zero on the first category of failure, and prints every problem it
 * found rather than only the first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'nl'];

const read = (p) => readFileSync(join(SRC, p), 'utf8');
const problems = [];
const note = (msg) => problems.push(msg);

// --- 1. The reason codes the hook knows about -------------------------------
const hookSrc = read('hooks/usePaywall.jsx');
const gatesBlock = hookSrc.match(/export const GATES = \{([\s\S]*?)\n\};/);
if (!gatesBlock) {
  note('usePaywall.jsx: could not find the GATES object.');
}
const gates = new Map();
for (const m of (gatesBlock?.[1] ?? '').matchAll(/^\s*(\w+):\s*\{\s*kind:\s*'(hard|soft)'/gm)) {
  gates.set(m[1], m[2]);
}
if (gates.size === 0) note('usePaywall.jsx: GATES parsed as empty.');

// --- 2. The copy map in the modal -------------------------------------------
const modalSrc = read('components/PassModal.jsx');
const copyBlock = modalSrc.match(/const REASON_COPY = \{([\s\S]*?)\n\};/);
if (!copyBlock) note('PassModal.jsx: could not find REASON_COPY.');
const copy = new Map();
for (const m of (copyBlock?.[1] ?? '').matchAll(
  /^\s*(\w+):\s*\{\s*heading:\s*'([^']+)'(?:,\s*sub:\s*'([^']+)')?\s*\}/gm
)) {
  copy.set(m[1], { heading: m[2], sub: m[3] || null });
}

// Every gate except the plain price table needs its own heading: `browse` is
// the one that deliberately falls back to the generic pass.heading.
for (const reason of gates.keys()) {
  if (reason === 'browse') continue;
  if (!copy.has(reason)) note(`PassModal REASON_COPY is missing a heading for '${reason}'.`);
}
for (const reason of copy.keys()) {
  if (!gates.has(reason)) note(`PassModal REASON_COPY has '${reason}', which is not a gate.`);
}

// --- 3. Every reason a call site actually passes -----------------------------
const walk = (dir) => readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = `${dir}/${e.name}`;
  if (e.isDirectory()) return walk(rel);
  return /\.(jsx?|mjs)$/.test(e.name) ? [rel] : [];
});
const files = walk('.').map((f) => f.replace(/^\.\//, ''));
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/paywall\.(?:require|nudge)\('([^']+)'\)/g)) {
    if (!gates.has(m[1])) note(`${f}: calls the paywall with unknown reason '${m[1]}'.`);
  }
}

// --- 4. Every key the modal can render, in all six locales -------------------
const wanted = new Set(['pass.heading', 'pass.lead']);
for (const { heading, sub } of copy.values()) {
  wanted.add(heading);
  if (sub) wanted.add(sub);
}

for (const lang of LOCALES) {
  const src = read(`i18n/${lang}.js`);
  for (const key of wanted) {
    // Keys are flat and double-quoted: "pass.headingExport": "...".
    if (!src.includes(`"${key}":`)) note(`i18n/${lang}.js is missing "${key}".`);
    else if (new RegExp(`"${key.replace('.', '\\.')}":\\s*""`).test(src)) {
      note(`i18n/${lang}.js has "${key}" set to an empty string.`);
    }
  }
}

// --- 5. Duplicate keys, which silently take the last value -------------------
for (const lang of LOCALES) {
  const src = read(`i18n/${lang}.js`);
  const seen = new Set();
  for (const m of src.matchAll(/^\s*"(pass\.[\w.]+)":/gm)) {
    if (seen.has(m[1])) note(`i18n/${lang}.js declares "${m[1]}" more than once.`);
    seen.add(m[1]);
  }
}

// --- 6. The funnel's event names, client against server ----------------------
// paywallEvents.js drops anything not in its own set before the wire, and
// paywall_event() drops anything not in its check constraint after it. Two
// lists that must agree and live in different languages, in different repos'
// worth of distance from each other, is exactly the drift this file exists for.
const MIGRATION = join(SRC, '..', '..', 'supabase', 'migrations', '022_paywall_events.sql');
let sqlEvents = null;
try {
  const sql = readFileSync(MIGRATION, 'utf8');
  const check = sql.match(/check \(event in \(([^)]+)\)\)/);
  if (check) sqlEvents = new Set([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
} catch {
  note('supabase/migrations/022_paywall_events.sql is missing; the funnel has no server side.');
}

const clientSrc = read('lib/paywallEvents.js');
const setLine = clientSrc.match(/const EVENTS = new Set\(\[([^\]]+)\]\)/);
const clientEvents = new Set(
  [...(setLine?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
);
if (clientEvents.size === 0) note('paywallEvents.js: could not parse its EVENTS set.');

if (sqlEvents) {
  for (const e of clientEvents) {
    if (!sqlEvents.has(e)) note(`paywallEvents.js sends '${e}', which migration 022 will drop.`);
  }
  for (const e of sqlEvents) {
    if (!clientEvents.has(e)) note(`migration 022 accepts '${e}', which nothing ever sends.`);
  }
}

// Every event name actually passed to trackPaywall must be one the client set
// admits, or it is silently discarded at the door.
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/trackPaywall\('([^']+)'/g)) {
    if (!clientEvents.has(m[1])) note(`${f}: trackPaywall('${m[1]}') is not a known event.`);
  }
}

// --- 7. The admin funnel's copy ----------------------------------------------
// English only, like the rest of the admin panel: one operator, one language.
const adminSrc = read('admin/AdminPage.jsx');
const enSrc = read('i18n/en.js');
for (const m of adminSrc.matchAll(/t\('(admin\.funnel[\w.]*)'/g)) {
  if (!enSrc.includes(`'${m[1]}'`)) note(`i18n/en.js is missing ${m[1]}.`);
}

// --- report ------------------------------------------------------------------
const reasons = [...gates.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
if (problems.length) {
  console.error(`verify_paywall: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`verify_paywall: ok`);
console.log(`  gates    ${gates.size}  (${reasons})`);
console.log(`  keys     ${wanted.size} x ${LOCALES.length} locales = ${wanted.size * LOCALES.length} strings`);
console.log(`  events   ${[...clientEvents].join(', ')}${sqlEvents ? ' (client and migration 022 agree)' : ''}`);
console.log(`  scanned  ${files.length} source files for reason codes`);
