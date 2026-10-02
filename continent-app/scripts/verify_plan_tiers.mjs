/**
 * verify_plan_tiers.mjs, a static check that the pricing table the traveller
 * sees matches the table the server enforces.
 *
 * WHY. The 007 migration header said the pricing UI reads plan_tiers so a
 * price change lands without a redeploy. It never did: PassModal renders the
 * TIERS object in src/lib/pricing.js, and nothing in src/ queries the table
 * (T030, register row T030-c). The product decision made in T265 is to keep
 * it that way, since two prices that change rarely are not worth a round
 * trip at the moment of purchase, and to make the drift impossible to miss
 * instead. This script is that: it reads the numbers out of pricing.js and
 * out of the migrations that write plan_tiers (the 007 insert, then every
 * later `update public.plan_tiers set ai_plans = N where tier = 'x'`, which
 * is how 021 and 044 pin the free row) and fails when they disagree.
 *
 * It cannot see the live table. T030 read it once and found it equal to the
 * migrations; a later drift on the live project would need a SQL editor
 * read, and the figures in 007 plus the updates below are what it should
 * show.
 *
 * No browser, no server, no dependencies. Run it from continent-app/:
 *
 *     node scripts/verify_plan_tiers.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// CARTA_REPO_ROOT names the root checkout when continent-app is a sibling
// worktree rather than a child directory.
const MIGRATIONS = join(process.env.CARTA_REPO_ROOT || join(ROOT, '..'), 'supabase', 'migrations');
const problems = [];
const note = (msg) => problems.push(msg);

// --- 1. pricing.js, the display copy ---------------------------------------
const pricing = readFileSync(join(ROOT, 'src', 'lib', 'pricing.js'), 'utf8');
const tiersBlock = pricing.match(/export const TIERS = \{([\s\S]*?)\n\};/);
if (!tiersBlock) note('pricing.js: could not find the TIERS object.');
const ui = new Map();
for (const m of (tiersBlock?.[1] ?? '').matchAll(
  /^\s*(\w+):\s*\{[\s\S]*?priceCents:\s*(\d+),[\s\S]*?aiPlans:\s*(\d+),[\s\S]*?grounded:\s*(\d+),[\s\S]*?periodDays:\s*(null|\d+)/gm,
)) {
  ui.set(m[1], {
    priceCents: Number(m[2]), aiPlans: Number(m[3]), grounded: Number(m[4]),
    periodDays: m[5] === 'null' ? null : Number(m[5]),
  });
}
if (ui.size !== 3) note(`pricing.js: expected 3 tiers in TIERS, parsed ${ui.size}.`);

// --- 2. the migrations, in file order --------------------------------------
let files = [];
try {
  files = readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
} catch {
  note(`cannot read ${MIGRATIONS}; run this from continent-app/ inside the root checkout.`);
}
const db = new Map();
for (const f of files) {
  const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
  // The 007 insert: ('tier', ai_plans, grounded, period_days, price_cents, rank)
  const insert = sql.match(/insert into public\.plan_tiers \(tier, ai_plans, grounded, period_days, price_cents, rank\)\s*values([\s\S]*?)on conflict/);
  if (insert) {
    for (const r of insert[1].matchAll(/\('(\w+)',\s*(\d+),\s*(\d+),\s*(null|\d+),\s*(\d+),\s*\d+\)/g)) {
      db.set(r[1], {
        aiPlans: Number(r[2]), grounded: Number(r[3]),
        periodDays: r[4] === 'null' ? null : Number(r[4]), priceCents: Number(r[5]),
      });
    }
  }
  // Later pins: update public.plan_tiers set ai_plans = N where tier = 'x'
  for (const u of sql.matchAll(/update public\.plan_tiers set ai_plans = (\d+) where tier = '(\w+)'/g)) {
    const row = db.get(u[2]);
    if (row) row.aiPlans = Number(u[1]);
  }
}
if (db.size !== 3) note(`migrations: expected 3 plan_tiers rows, parsed ${db.size}.`);

// --- 3. compare --------------------------------------------------------------
for (const [tier, u] of ui) {
  const d = db.get(tier);
  if (!d) { note(`'${tier}' is in pricing.js but not in the migrations.`); continue; }
  for (const k of ['priceCents', 'aiPlans', 'grounded', 'periodDays']) {
    if (u[k] !== d[k]) {
      note(`${tier}.${k}: pricing.js says ${u[k]}, the migrations say ${d[k]}. The server wins; fix pricing.js or write a migration.`);
    }
  }
}
for (const tier of db.keys()) {
  if (!ui.has(tier)) note(`'${tier}' is in the migrations but not in pricing.js.`);
}
if (db.get('free') && db.get('free').aiPlans !== 2) {
  note(`the free row resolves to ${db.get('free').aiPlans} plans across the migrations; 021 and 044 pin it to 2.`);
}

// --- report ----------------------------------------------------------------
if (problems.length) {
  console.error(`verify_plan_tiers: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('verify_plan_tiers: ok');
for (const [tier, d] of db) {
  console.log(`  ${tier}: ${d.priceCents} cents, ${d.aiPlans} plans, ${d.grounded} grounded, ${d.periodDays ?? 'no'} days`);
}
