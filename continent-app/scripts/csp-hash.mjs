// Prints the CSP source-expression hash for every inline <script> in
// index.html, so `script-src` in vercel.json can allow them individually
// instead of falling back to 'unsafe-inline'.
//
//   node scripts/csp-hash.mjs [file]      (default index.html)
//
// Pass dist/index.html to confirm the build passed the block through
// unchanged, since a reformatted block would invalidate the shipped hash.
//
// Run this after ANY edit to an inline script block (whitespace counts) and
// paste the resulting 'sha256-...' values into the script-src directive.
// Newlines are normalised to LF first, because the HTML parser does that
// before the hash is computed and CRLF in the file would otherwise mismatch.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, process.argv[2] || 'index.html'), 'utf8');

const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];

if (!blocks.length) {
  console.log('No inline <script> blocks found.');
} else {
  for (const [, body] of blocks) {
    const normalised = body.replace(/\r\n?/g, '\n');
    const hash = createHash('sha256').update(normalised, 'utf8').digest('base64');
    const first = normalised.trim().split('\n')[0].slice(0, 60);
    console.log(`'sha256-${hash}'   // ${first}...`);
  }
}
