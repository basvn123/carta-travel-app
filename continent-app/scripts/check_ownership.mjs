#!/usr/bin/env node
/**
 * Ownership check (T380, design wave V2).
 *
 * docs/design-v6/OWNERSHIP.md (root repo) assigns every file under src/ to
 * exactly one of the ten v6 surfaces. This script proves it: it walks src/
 * for .js, .jsx, .mjs and .css files, reads every backticked path in the
 * ownership tables, and reports files that are missing from the tables,
 * listed twice, or listed but absent on disk. It prints the count per
 * surface and exits 1 on any gap.
 *
 * Usage, from the app repo (continent-app or its worktree):
 *   node scripts/check_ownership.mjs [path/to/OWNERSHIP.md]
 * The default path is ../docs/design-v6/OWNERSHIP.md (the main checkout
 * layout). In a wave worktree pass the root worktree's copy explicitly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const docPath = path.resolve(process.argv[2] || path.join(appRoot, '..', 'docs', 'design-v6', 'OWNERSHIP.md'));

const SURFACES = ['shell', 'landing', 'explore', 'destinations', 'destination', 'outdoor', 'trips', 'tripplanner', 'dayplanner', 'account'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|js|jsx|mjs)$/.test(e.name)) out.push(path.relative(appRoot, p).split(path.sep).join('/'));
  }
  return out;
}

if (!fs.existsSync(docPath)) {
  console.error(`OWNERSHIP.md not found at ${docPath}`);
  process.exit(2);
}
const doc = fs.readFileSync(docPath, 'utf8');

// Only the assignment tables count: a row is "| `src/...` | surface | ... |".
// Prose that mentions a path (the hand-off notes) is not an assignment.
const owned = new Map(); // file -> [surfaces]
const rowRe = /^\|\s*`(src\/[^`]+)`\s*\|\s*([a-z]+)\s*\|/gm;
let m;
while ((m = rowRe.exec(doc))) {
  const [, file, surface] = m;
  if (!SURFACES.includes(surface)) {
    console.error(`Unknown surface "${surface}" on ${file}`);
    process.exit(1);
  }
  if (!owned.has(file)) owned.set(file, []);
  owned.get(file).push(surface);
}

const onDisk = walk(path.join(appRoot, 'src')).sort();
const missing = onDisk.filter((f) => !owned.has(f));
const doubled = [...owned.entries()].filter(([, s]) => s.length > 1).map(([f, s]) => `${f} (${s.join(', ')})`);
const ghosts = [...owned.keys()].filter((f) => !fs.existsSync(path.join(appRoot, f)));

const counts = Object.fromEntries(SURFACES.map((s) => [s, 0]));
for (const [, s] of owned) counts[s[0]] += 1;

console.log(`src files on disk: ${onDisk.length}`);
console.log(`files assigned:    ${owned.size}`);
for (const s of SURFACES) console.log(`  ${s.padEnd(13)} ${String(counts[s]).padStart(4)}`);
if (missing.length) console.log(`\nMissing from OWNERSHIP.md (${missing.length}):\n  ${missing.join('\n  ')}`);
if (doubled.length) console.log(`\nAssigned twice (${doubled.length}):\n  ${doubled.join('\n  ')}`);
if (ghosts.length) console.log(`\nListed but not on disk (${ghosts.length}):\n  ${ghosts.join('\n  ')}`);

const ok = !missing.length && !doubled.length && !ghosts.length;
console.log(ok ? '\nOK: every file under src/ is owned by exactly one surface.' : '\nFAIL');
process.exit(ok ? 0 : 1);
