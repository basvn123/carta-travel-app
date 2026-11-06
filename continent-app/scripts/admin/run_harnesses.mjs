/**
 * Run every database harness in this directory, one after another, against
 * one throwaway PostgreSQL (T1087, ROADMAP C4).
 *
 *   PGHOST=127.0.0.1 PGPORT=55437 PGUSER=postgres node continent-app/scripts/admin/run_harnesses.mjs
 *   ... run_harnesses.mjs --except test_admin_rpc_security,test_rls_policies
 *
 * Each test_*.mjs creates and drops its own database, so they share a server
 * but never a database. They run in sequence because several reuse the same
 * database name pattern and all of them create and drop roles.
 *
 * A harness SKIPS and exits 0 when it cannot reach a server or find psql.
 * That is right for a laptop and wrong here: a skip would read as a pass. So
 * this runner fails a harness that printed SKIPPED, as well as one that
 * exited non-zero, and prints one summary line per harness.
 *
 * `--except` takes basenames without .mjs: CI runs test_admin_rpc_security
 * and test_rls_policies in their own workflows and leaves them out here.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const exceptArg = process.argv.find((a) => a.startsWith('--except='))
  || (process.argv.includes('--except') ? `--except=${process.argv[process.argv.indexOf('--except') + 1] || ''}` : '');
const except = new Set(exceptArg.replace('--except=', '').split(',').map((x) => x.trim()).filter(Boolean));

const harnesses = readdirSync(here)
  .filter((f) => /^test_.*\.mjs$/.test(f) && !except.has(f.replace(/\.mjs$/, '')))
  .sort();

if (harnesses.length === 0) {
  console.error('FAIL  no harnesses found');
  process.exit(1);
}

const results = [];
for (const file of harnesses) {
  const started = Date.now();
  console.log(`\n===== ${file} =====`);
  const r = spawnSync(process.execPath, [join(here, file)], { encoding: 'utf-8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  process.stdout.write(out);
  const skipped = /SKIPPED/.test(out);
  const passed = r.status === 0 && !skipped;
  const oks = (out.match(/^ {2}ok {2}/gm) || []).length;
  const fails = (out.match(/^FAIL {2}/gm) || []).length;
  results.push({ file, passed, skipped, status: r.status, oks, fails, secs: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log('\n===== summary =====');
for (const x of results) {
  const verdict = x.passed ? 'pass' : x.skipped ? 'SKIP (counts as a failure)' : `FAIL (exit ${x.status})`;
  console.log(`${verdict.padEnd(28)} ${x.file.padEnd(36)} ok=${x.oks} fail=${x.fails} ${x.secs}s`);
}
const bad = results.filter((x) => !x.passed);
console.log(`${results.length - bad.length} of ${results.length} harnesses green`);
process.exit(bad.length ? 1 : 0);
