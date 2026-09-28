#!/usr/bin/env node
/**
 * Cloudflare Pages deploy-limit gate.
 *
 * Pages refuses a deployment that exceeds either of two hard limits:
 *
 *   - 20,000 files per site
 *   - 25 MiB per file
 *
 * Both are per-deployment and neither is negotiable on any plan, so the only
 * useful place to find out is before the upload, not during it. A rejected
 * deploy tells you the count; it does not tell you which directory caused it.
 * This does.
 *
 * Why the count is so far over today: the wire pre-bakes one file per
 * destination per layer, and trails plus cycling alone are about two thirds of
 * the total. The fix is not to prune the wire, it is to move the detail shards
 * to R2 (CARTA_CLOUD_ARCHITECTURE.md section 5.2, task T054), after which the
 * Pages deploy is a few hundred build artifacts and this gate passes with room
 * to spare. Until that lands, this script is expected to FAIL, and that failure
 * is the point: it is the machine-checkable form of the dependency, so nobody
 * discovers the ceiling by watching a production cut-over fail.
 *
 * Usage:
 *   node scripts/check-pages-limits.mjs [dir]      # default: dist
 *
 * Exit 0 when the tree would deploy, 1 when it would be rejected. Prints the
 * per-directory breakdown either way, because the number on its own is not
 * actionable and the breakdown is what tells you what to move next.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const FILE_LIMIT = 20_000;
const SIZE_LIMIT = 25 * 1024 * 1024; // 25 MiB

// Pages ignores these when counting, so neither should we or the number is
// pessimistic and stops being comparable to what the deploy actually reports.
const IGNORED_NAMES = new Set(['_headers', '_redirects', '_routes.json', '_worker.js']);

const root = process.argv[2] ?? 'dist';

/** Walk `dir`, returning every file with its size. Iterative, so a deep tree
 *  cannot blow the stack. */
async function walk(dir) {
  const out = [];
  const queue = [dir];
  while (queue.length) {
    const current = queue.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' && current === dir) return null;
      throw err;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile()) {
        const { size } = await stat(full);
        out.push({ path: full, size });
      }
      // Symlinks are skipped: Pages follows the file it uploads, and counting
      // both the link and its target would double-count.
    }
  }
  return out;
}

const files = await walk(root);

if (files === null) {
  console.error(
    `check-pages-limits: "${root}" does not exist. Run \`npm run build\` first, ` +
      `or pass the directory to check.`,
  );
  process.exit(1);
}

const counted = files.filter((f) => !IGNORED_NAMES.has(f.path.split(sep).pop()));
const oversize = counted.filter((f) => f.size > SIZE_LIMIT);

// Group by first path segment under the root, which is the unit you would
// actually move to R2.
const byDir = new Map();
for (const f of counted) {
  const rel = relative(root, f.path);
  const segments = rel.split(sep);
  const key = segments.length > 1 ? segments[0] + '/' : '(root files)';
  const row = byDir.get(key) ?? { files: 0, bytes: 0 };
  row.files += 1;
  row.bytes += f.size;
  byDir.set(key, row);
}

const totalBytes = counted.reduce((sum, f) => sum + f.size, 0);
const mib = (bytes) => (bytes / 1024 / 1024).toFixed(1);

console.log(`Cloudflare Pages limit check on "${root}"\n`);

const rows = [...byDir.entries()].sort((a, b) => b[1].files - a[1].files);
const width = Math.max(12, ...rows.map(([name]) => name.length));
console.log(`${'path'.padEnd(width)}  ${'files'.padStart(7)}  ${'MiB'.padStart(8)}`);
for (const [name, row] of rows) {
  console.log(`${name.padEnd(width)}  ${String(row.files).padStart(7)}  ${mib(row.bytes).padStart(8)}`);
}
console.log(`${'TOTAL'.padEnd(width)}  ${String(counted.length).padStart(7)}  ${mib(totalBytes).padStart(8)}`);

const problems = [];

if (counted.length > FILE_LIMIT) {
  const over = counted.length - FILE_LIMIT;
  problems.push(
    `${counted.length} files exceeds the Pages ceiling of ${FILE_LIMIT} by ${over} ` +
      `(${(counted.length / FILE_LIMIT).toFixed(1)}x the limit). Move detail shards to R2 ` +
      `(T054) before deploying; the directories at the top of the table above are the ` +
      `ones worth moving.`,
  );
}

for (const f of oversize) {
  problems.push(
    `${relative(root, f.path)} is ${mib(f.size)} MiB, over the ${SIZE_LIMIT / 1024 / 1024} MiB ` +
      `per-file limit.`,
  );
}

console.log('');
if (problems.length) {
  console.error('FAIL: this tree would be rejected by Cloudflare Pages.\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `PASS: ${counted.length} files (${FILE_LIMIT - counted.length} under the ceiling), ` +
    `largest file within the ${SIZE_LIMIT / 1024 / 1024} MiB limit.`,
);
