/**
 * verify_paywall_funnel.mjs, a static check that the funnel's hard/soft split
 * cannot drift the way T034 found it could.
 *
 * verify_paywall.mjs already checks the reason codes, the modal copy and the
 * locale strings. This is a sibling rather than an addition to that file
 * because it checks a different seam: the hard/soft mapping that migration
 * 027 restates in SQL (t034_gate_kind) has no way to import GATES from
 * hooks/usePaywall.jsx, so the two are hand-kept in sync, and a hand-kept
 * pair of lists is exactly the kind of thing that silently drifts. This
 * script is the thing that would fail the day it does.
 *
 * It also checks that every gate reachable from the app has at least one
 * `require` or `nudge` call site. A gate defined in GATES with no call site
 * can never fire a `shown` event, so it can never appear in the funnel this
 * task built, and that absence would otherwise look like "this gate never
 * gets used" rather than "this gate is dead code". T034 found exactly one:
 * `expiring` has copy and a reason code and is called from nowhere.
 *
 * No browser, no server, no dependencies. Run it from continent-app/:
 *
 *     node scripts/verify_paywall_funnel.mjs
 *
 * It does not touch the database. The funnel's actual numbers (shown counts
 * matching generated traffic, conversion rates, the live-versus-local state
 * of migration 022) were checked by hand against a local Supabase stack for
 * T034 and are written up in Execution/P2/T034-paywall-funnel-instrumentation.md,
 * because a script here has no database to query against in CI and nothing
 * currently runs this in CI regardless (see CLAUDE.md: tests are not wired to
 * CI). What this script can check without a database, it checks on every run.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const problems = [];
const note = (msg) => problems.push(msg);

const read = (p) => readFileSync(join(SRC, p), 'utf8');

// --- 1. GATES, as the source of truth -----------------------------------
const hookSrc = read('hooks/usePaywall.jsx');
const gatesBlock = hookSrc.match(/export const GATES = \{([\s\S]*?)\n\};/);
if (!gatesBlock) note('usePaywall.jsx: could not find the GATES object.');
const gates = new Map();
for (const m of (gatesBlock?.[1] ?? '').matchAll(/^\s*(\w+):\s*\{\s*kind:\s*'(hard|soft)'/gm)) {
  gates.set(m[1], m[2]);
}
if (gates.size === 0) note('usePaywall.jsx: GATES parsed as empty.');

// --- 2. migration 027's t034_gate_kind, restated by hand -----------------
const MIGRATION = join(ROOT, '..', 'supabase', 'migrations', '027_paywall_funnel_kinds.sql');
let sql = '';
try {
  sql = readFileSync(MIGRATION, 'utf8');
} catch {
  note('supabase/migrations/027_paywall_funnel_kinds.sql is missing.');
}
const caseBlock = sql.match(/select case p_reason([\s\S]*?)end;/);
const sqlKinds = new Map();
for (const m of (caseBlock?.[1] ?? '').matchAll(/when\s+'([^']+)'\s+then\s+'(hard|soft)'/g)) {
  sqlKinds.set(m[1], m[2]);
}
if (sql && sqlKinds.size === 0) {
  note('027_paywall_funnel_kinds.sql: could not parse t034_gate_kind\'s case expression.');
}

// t034_gate_kind only spells out the SOFT reasons and defaults everything
// else to 'hard' (see its own header comment for why: an unlisted future gate
// should read as an urgent hard gate rather than a silently downgraded soft
// one). So the check here is one-directional and only about the soft list:
// every reason GATES calls 'soft' must have an explicit case in the SQL, and
// every reason the SQL calls 'soft' must still be 'soft' in GATES. A 'hard'
// gate needing no case at all is the intended shape, not a gap.
for (const [reason, kind] of gates) {
  if (kind !== 'soft') continue;
  if (!sqlKinds.has(reason) || sqlKinds.get(reason) !== 'soft') {
    note(`027_paywall_funnel_kinds.sql: t034_gate_kind does not mark '${reason}' as soft, but GATES in usePaywall.jsx does. It will be counted as hard in the funnel.`);
  }
}
for (const [reason, kind] of sqlKinds) {
  if (kind !== 'soft') continue;
  if (!gates.has(reason) || gates.get(reason) !== 'soft') {
    note(`027_paywall_funnel_kinds.sql: t034_gate_kind marks '${reason}' as soft, but it is not a soft gate in GATES any more (or does not exist).`);
  }
}

// --- 3. Every gate must be reachable, or it can never appear in the funnel -
const walk = (dir) => readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = `${dir}/${e.name}`;
  if (e.isDirectory()) return walk(rel);
  return /\.(jsx?|mjs)$/.test(e.name) ? [rel] : [];
});
const files = walk('.').map((f) => f.replace(/^\.\//, ''));
const called = new Set();
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/paywall\.(?:require|nudge)\('([^']+)'\)/g)) {
    called.add(m[1]);
  }
  // onOpenPass(reason) call sites (AiDayPlanModal) resolve to require() one
  // hop away in the component that mounts it; matched separately so 'plans',
  // 'ground' and 'plansLow' are not flagged as unreachable.
  for (const m of src.matchAll(/onOpenPass\('([^']+)'\)/g)) {
    called.add(m[1]);
  }
}
for (const [reason] of gates) {
  if (reason === 'browse') continue; // opened structurally via openPrices(), not a literal reason string
  if (!called.has(reason)) {
    note(`'${reason}' is a gate in GATES with no require()/nudge()/onOpenPass() call site anywhere in src/. It can never produce a 'shown' event and will never appear in the funnel.`);
  }
}

// --- report ----------------------------------------------------------------
if (problems.length) {
  console.error(`verify_paywall_funnel: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('verify_paywall_funnel: ok');
console.log(`  gates matched between GATES and t034_gate_kind: ${gates.size}`);
console.log(`  reachable gates: ${[...called].sort().join(', ')}`);
