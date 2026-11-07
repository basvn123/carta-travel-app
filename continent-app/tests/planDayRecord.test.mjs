// T1206 (register row T1138-b): the plan-day recorder. A fake plan-day
// endpoint on a local port answers each eval case with the reference
// planner's plan; the recorder writes the file `run.mjs plan-day --plans`
// reads, and the eval scores it exactly as it scores the reference planner.
// No Supabase, no model, no key.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordAll, requestFor } from '../scripts/eval/plan-day/record.mjs';
import { loadCases, referencePlan } from '../scripts/eval/plan-day/plan-day-lib.mjs';
import { run } from '../scripts/eval/adapters/plan-day.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/eval/plan-day/record.mjs', import.meta.url));
const set = loadCases();

test('each case becomes the request the app sends: the deck, the named places, pace, vibe and walk', () => {
  for (const c of set.cases) {
    const r = requestFor(c);
    assert.equal(r.candidates, c.candidates);
    assert.equal(r.dest.city, c.city);
    assert.equal(r.pace, c.answers.pace);
    assert.equal(r.vibe, c.answers.vibe);
    assert.deepEqual(r.mustInclude.map((m) => m.id), c.answers.named);
    assert.equal(r.profile?.maxWalkKm ?? null, c.answers.maxWalkKm ?? null);
    assert.ok(Number.isFinite(r.dest.lat) && Number.isFinite(r.dest.lon));
  }
});

test('recorded from a fake endpoint, the plans score as the reference planner does', async (t) => {
  const byDest = new Map(set.cases.map((c) => [`eval-${c.id}`, c]));
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push({ auth: req.headers.authorization, apikey: req.headers.apikey, id: body.dest.id });
      const c = byDest.get(body.dest.id);
      // pd03 fails the way a refused call does; the others answer.
      if (c.id === 'pd03') { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"code":"ai_bad_output"}'); return; }
      const plan = referencePlan(c);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ...plan, meta: { model: 'fake-model', fellBack: false, cached: c.id === 'pd02' } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/functions/v1/plan-day`;
  const plans = await recordAll({ cases: set.cases, url, anonKey: 'anon', jwt: 'tok', provider: 'fake' });

  assert.equal(seen.length, set.cases.length);
  assert.ok(seen.every((s) => s.auth === 'Bearer tok' && s.apikey === 'anon'));
  assert.equal(plans._meta.provider, 'fake');
  assert.deepEqual(plans._meta.models, { 'fake-model': set.cases.length - 1 });
  assert.deepEqual(plans._meta.cached, ['pd02']);
  assert.match(plans._meta.failed.pd03, /^502 ai_bad_output/);
  assert.equal(plans.pd03, undefined);

  const dir = mkdtempSync(join(tmpdir(), 'carta-record-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'plans.json');
  writeFileSync(file, JSON.stringify(plans));
  const reference = await run();
  const recorded = await run({ plans: file });
  // Every case but the failed one is the reference plan; the failed one scores as missing.
  assert.equal(recorded.cases.n, reference.cases.n);
  assert.equal(recorded.cases.passed, reference.cases.passed - (reference.gate.failures.some((f) => f.key === 'pd03') ? 0 : 1));
  assert.ok(recorded.gate.failures.some((f) => f.key === 'pd03' && /no plan for this case/.test(f.why)));
});

test('the command builds 20 requests on --dry-run and refuses a hosted URL without --allow-remote', () => {
  const dry = spawnSync(process.execPath, [SCRIPT, '--dry-run'], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, new RegExp(`dry run: ${set.cases.length} requests`));
  const remote = spawnSync(process.execPath, [SCRIPT, '--url', 'https://abc.supabase.co/functions/v1/plan-day'], { encoding: 'utf8', env: { ...process.env, CARTA_JWT: 'x' } });
  assert.equal(remote.status, 2);
  assert.match(remote.stderr, /refusing a hosted Supabase URL/);
});
