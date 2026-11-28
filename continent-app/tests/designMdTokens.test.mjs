// DESIGN.md's token header is generated from 01-tokens.css
// (scripts/ci/design-md-tokens.mjs); this fails the suite when it drifts,
// so CI catches a token change that forgot to regenerate it (K1 step C).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/ci/design-md-tokens.mjs', import.meta.url));
const design = fileURLToPath(new URL('../../DESIGN.md', import.meta.url));

test('DESIGN.md token header matches 01-tokens.css', () => {
  const r = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stderr}${r.stdout}`);
});

test('every {token} the prose names exists in the header', () => {
  const doc = readFileSync(design, 'utf8').replace(/\r\n/g, '\n');
  const end = doc.indexOf('\n---', 4);
  const header = doc.slice(0, end);
  const body = doc.slice(end);
  const refs = [...new Set([...body.matchAll(/\{(colors|typography|rounded|spacing|motion)\.([\w-]+)\}/g)].map((m) => `${m[1]}.${m[2]}`))];
  assert.ok(refs.length > 20, 'the prose names its tokens');
  for (const ref of refs) {
    const [group, key] = ref.split('.');
    const block = header.slice(header.indexOf(`\n${group}:`));
    assert.match(block, new RegExp(`\\n  "?${key}"?:`), `${ref} is named in the prose but not in the header`);
  }
});
