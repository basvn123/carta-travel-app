// H11 (T1162, audit P-18): the css-routes proof runs inside `npm test`, so CI
// catches a route rule that could change a screen before a ship does (T1040's
// ship hit 115 such problems at the deploy step). It builds the app with the
// fast build (publicDir off, about 3 s) into a temp folder and runs
// `css-routes.mjs --check` on it (about 10 s).
//
// CARTA_SKIP_CSS_ROUTES=1 skips it for a quick local loop; CI never sets it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.env.CARTA_SKIP_CSS_ROUTES === '1' ? 'CARTA_SKIP_CSS_ROUTES=1' : false;

test('css-routes --check passes on a fresh fast build', { skip, timeout: 300_000 }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-css-routes-'));
  try {
    const vite = path.join(APP, 'node_modules', 'vite', 'bin', 'vite.js');
    const build = spawnSync(process.execPath, [vite, 'build', '--config', path.join(APP, '..', 'scripts', 'vite.fast.mjs')], {
      cwd: APP, env: { ...process.env, FAST_OUT: out, CARTA_APP: APP }, encoding: 'utf8',
    });
    assert.equal(build.status, 0, `fast build failed:\n${build.stdout}\n${build.stderr}`);
    const check = spawnSync(process.execPath, [path.join(APP, 'scripts', 'css-routes.mjs'), '--check', path.join(out, 'assets')], {
      cwd: APP, encoding: 'utf8',
    });
    assert.equal(check.status, 0, `css-routes --check failed:\n${check.stdout}\n${check.stderr}`);
    assert.match(check.stdout, /route selectors checked/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
