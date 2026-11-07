// I15 (T1172): every partner link goes through lib/partnerLink.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partnerOf, partnerRel, partnerLinkProps, partnerButtonProps, anyPartner, PARTNER_REL, PLAIN_REL } from '../src/lib/partnerLink.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('without any partner id every link is plain: no sponsored rel, no data-partner', () => {
  // The test environment has no VITE_* ids, which is the fallback case.
  for (const u of ['https://www.getyourguide.com/x?partner_id=1', 'https://omio.sjv.io/c/1/2/3', 'https://www.aviasales.com/search/X?marker=1']) {
    assert.equal(partnerOf(u), null);
    assert.equal(partnerRel(u), PLAIN_REL);
    const p = partnerLinkProps(u, { className: 'a' });
    assert.equal(p.rel, PLAIN_REL);
    assert.equal(p.target, '_blank');
    assert.equal(p.className, 'a');
    assert.equal('data-partner' in p, false);
  }
  assert.equal(partnerOf(''), null);
  assert.equal(partnerOf(undefined), null);
  assert.equal(anyPartner([{ href: 'https://example.com' }, 'https://x.y']), false);
  assert.equal(partnerButtonProps('https://example.com').external, true);
});

test('with ids configured a decorated link is a partner link', async () => {
  process.env.X = '1';
  // The builders read import.meta.env at load; re-check the pure reverse functions with explicit ids.
  const { activityClickOf } = await import('../src/lib/activityAffiliates.js');
  assert.deepEqual(activityClickOf('https://www.getyourguide.com/p?partner_id=GY1&cmp=dest-do', 'GY1', ''), { partner: 'getyourguide', surface: 'dest-do' });
  assert.equal(PARTNER_REL, 'sponsored noopener');
});

test('no component writes a raw partner URL or hand-rolls a partner anchor', () => {
  const offenders = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'i18n') walk(full); continue; }
      if (!/\.(jsx?|mjs)$/.test(f.name)) continue;
      const rel = path.relative(SRC, full).replace(/\\/g, '/');
      // The builders and the helper are the only places allowed to know partner hosts.
      if (/^lib\/(affiliate|omio|activityAffiliates|partnerLink|transportLinks|destinationPdf)\.js$/.test(rel)) continue;
      const s = fs.readFileSync(full, 'utf8');
      if (/https?:\/\/[^'"`\s]*(aviasales\.com|omio\.sjv\.io|getyourguide\.[a-z]+|viator\.com)/i.test(s)) offenders.push(`${rel}: raw partner URL`);
      s.split('\n').forEach((line, i) => {
        if (/\b(activityLink|buildOmioLink|buildAviasalesLink)\(/.test(line) && /<a\b/.test(line)) offenders.push(`${rel}:${i + 1}: partner anchor built inline`);
      });
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, []);
});

test('the partner.* keys exist in all six languages', () => {
  for (const l of ['en', 'nl', 'fr', 'de', 'es', 'it']) {
    const s = fs.readFileSync(path.join(SRC, 'i18n', `${l}.js`), 'utf8');
    for (const k of ['mark', 'markTip', 'note', 'how', 'title', 'intro', 'figureH', 'figureP', 'doorH', 'doorP', 'orderH', 'orderP', 'countH', 'countP']) {
      assert.ok(s.includes(`"partner.${k}"`), `${l} lacks partner.${k}`);
    }
    assert.ok(!/[–—]/.test(s.split('\n').filter((x) => x.includes('"partner.')).join('\n')), `${l} has a dash in partner.*`);
  }
});
