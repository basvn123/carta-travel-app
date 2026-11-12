// H11 (T1162): scripts/ship.mjs runs CLAUDE.md's deploy steps in order and
// stops on the first failed step. Every test here uses a fake runner, so no
// command reaches the build, R2 or Cloudflare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runShip, shipSteps, commandLine, preflight, tomlTopKeys, checkPagesConfig } from '../../scripts/ship.mjs';

test('preflight refuses wrangler.toml keys that Pages rejects (H3, owner sweep 2026-11-12)', () => {
  const keys = tomlTopKeys('name = "x"\n# c = 1\n[[r2_buckets]]\nbinding = "B"\n[[ratelimits]]\nname = "RL"\n  [ratelimits.simple]\n  limit = 1\n[ai]\nbinding = "AI"\n');
  assert.deepEqual([...keys].sort(), ['ai', 'name', 'r2_buckets', 'ratelimits']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
  fs.mkdirSync(path.join(dir, 'continent-app'));
  const toml = path.join(dir, 'continent-app', 'wrangler.toml');
  fs.writeFileSync(toml, 'name = "carta-app"\n[[ratelimits]]\nname = "RL_ASK"\n');
  assert.equal(checkPagesConfig(dir).level, 'fail');
  assert.match(checkPagesConfig(dir).msg, /ratelimits/);
  fs.writeFileSync(toml, 'name = "carta-app"\npages_build_output_dir = "dist"\n[[kv_namespaces]]\nid = "1"\n');
  assert.equal(checkPagesConfig(dir).level, 'ok');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the real continent-app/wrangler.toml passes the Pages key check', () => {
  assert.equal(checkPagesConfig().level, 'ok', checkPagesConfig().msg);
});

const OK = [{ level: 'ok', msg: 'fake preflight' }];
const quiet = () => {};

function fakeRunner(codes = {}) {
  const calls = [];
  return { calls, run: (step) => { calls.push(step); return codes[step.label] ?? 0; } };
}

test('the steps are CLAUDE.md\'s deploy, in its order', () => {
  const steps = shipSteps({ repoRoot: '/repo' });
  assert.deepEqual(steps.map((s) => s.id), ['build', 'css', 'data', 'preview', 'main', 'prune']);
  const line = (id) => commandLine(steps.find((s) => s.id === id));
  assert.equal(line('build'), 'VITE_E2E_SEAMS="" npm run build:pages');
  assert.equal(line('css'), 'node scripts/css-routes.mjs --check dist/assets');
  assert.equal(line('data'), 'node scripts/r2/push-data.mjs --live');
  assert.equal(line('preview'), 'npx wrangler pages deploy dist --project-name carta-app --branch preview');
  assert.equal(line('main'), 'npx wrangler pages deploy dist --project-name carta-app --branch main');
  // The prune keeps its typed "delete": no --yes.
  assert.equal(line('prune'), 'node scripts/r2/push-data.mjs --live --prune');
});

test('a dry run runs only the two read-only twins and prints the rest', () => {
  const f = fakeRunner();
  const lines = [];
  const res = runShip({ live: false, runner: f.run, checks: OK, log: (l) => lines.push(l) });
  assert.equal(res.ok, true);
  assert.deepEqual(res.ran, ['build', 'css', 'data', 'preview', 'main', 'prune']);
  assert.deepEqual(f.calls.map((s) => s.label), ['fast build into .fastbuild', 'css-routes proof on .fastbuild/assets']);
  for (const s of f.calls) assert.doesNotMatch(s.args.join(' '), /--live|wrangler/);
  assert.ok(lines.some((l) => /would run {2}npx wrangler pages deploy dist .*--branch main/.test(l)));
});

test('a live ship runs every step in order', () => {
  const f = fakeRunner();
  const res = runShip({ live: true, runner: f.run, checks: OK, log: quiet });
  assert.equal(res.ok, true);
  assert.deepEqual(f.calls.map((s) => s.args.at(-1)), ['build:pages', 'dist/assets', '--live', 'preview', 'main', '--prune']);
});

test('a failed step stops the ship: nothing after it runs', () => {
  const f = fakeRunner({ 'data to R2 (phase 1)': 3 });
  const lines = [];
  const res = runShip({ live: true, runner: f.run, checks: OK, log: (l) => lines.push(l) });
  assert.equal(res.ok, false);
  assert.equal(res.failed, 'data');
  assert.equal(res.code, 3);
  assert.deepEqual(res.ran, ['build', 'css']);
  assert.deepEqual(res.skipped, ['preview', 'main', 'prune']);
  assert.equal(f.calls.length, 3);
  assert.ok(lines.some((l) => l.includes('--live --from data')));
});

test('a seeded failure stops a dry run at that step', () => {
  for (const at of ['build', 'css', 'preview']) {
    const f = fakeRunner();
    const res = runShip({ live: false, failAt: at, runner: f.run, checks: OK, log: quiet });
    assert.equal(res.ok, false, at);
    assert.equal(res.failed, at);
    const ids = ['build', 'css', 'data', 'preview', 'main', 'prune'];
    assert.deepEqual(res.ran, ids.slice(0, ids.indexOf(at)));
  }
});

test('--from resumes at a step and skips the ones before', () => {
  const f = fakeRunner();
  const res = runShip({ live: true, from: 'preview', runner: f.run, checks: OK, log: quiet });
  assert.equal(res.ok, true);
  assert.deepEqual(res.skipped, ['build', 'css', 'data']);
  assert.deepEqual(res.ran, ['preview', 'main', 'prune']);
});

test('an unknown step name is refused before anything runs', () => {
  const f = fakeRunner();
  assert.throws(() => runShip({ from: 'deploy', runner: f.run, checks: OK, log: quiet }), /unknown step/);
  assert.equal(f.calls.length, 0);
});

test('a failed preflight check stops before the first step', () => {
  const f = fakeRunner();
  const res = runShip({ live: true, runner: f.run, log: quiet, checks: [{ level: 'fail', msg: 'dirty tree' }] });
  assert.equal(res.ok, false);
  assert.equal(res.failed, 'preflight');
  assert.equal(f.calls.length, 0);
});

test('preflight: a dry run warns where a live ship refuses', () => {
  // The test checkout is never a clean main with a huge disk need met.
  const need = Number.MAX_SAFE_INTEGER;
  const dry = preflight({ live: false, needBytes: need });
  const live = preflight({ live: true, needBytes: need });
  const disk = (cs) => cs.find((c) => /free disk/.test(c.msg));
  assert.equal(disk(dry).level, 'warn');
  assert.equal(disk(live).level, 'fail');
  assert.ok(!dry.some((c) => c.level === 'fail' && /disk|branch|changed/.test(c.msg)));
});
