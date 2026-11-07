// T1197 (ROADMAP D16): the Data health tab lists broken links with a fix-or-drop
// action that drafts a hand correction through the I13 override flow.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const broken = (path, extra = {}) => ({
  url: 'https://upload.wikimedia.org/gone.jpg', kind: 'image', status: 404, err: null, final: 'https://upload.wikimedia.org/gone.jpg',
  checked_at: '2026-11-07T10:00:00Z', uses: 2, where: [{ file: 'app_data.json', layer: 'dest', id: 'rome', path }], ...extra,
});
const fixture = {
  generated_at: '2026-11-07T10:00:00Z',
  totals: { links: 900, checked: 600, ok: 580, moved: 5, unsure: 5, robots: 0, broken: 10, broken_share: 0.0167 },
  kinds: { image: { links: 800, checked: 500, ok: 480, moved: 5, unsure: 5, robots: 0, broken: 10 } },
  broken: [broken('image.url')], broken_total: 1, moved: [], moved_total: 0,
};

test('the panel shows the totals, the kinds and the broken list with actions', async () => {
  const [{ default: React }, server, mod] = await Promise.all([
    import('react'), import('react-dom/server'), vite.ssrLoadModule('/src/components/admin/LinkHealth.jsx'),
  ]);
  const html = server.renderToStaticMarkup(React.createElement(mod.LinkHealth, { data: fixture, existing: [] }));
  assert.match(html, /data-links="card"/);
  assert.match(html, /1\.7%/);
  assert.match(html, /data-url="https:\/\/upload\.wikimedia\.org\/gone\.jpg"/);
  assert.match(html, /data-action="fix"/);
  assert.match(html, /data-action="drop"/);
  assert.match(html, /dest rome image\.url \(\+1 more\)/);
  assert.doesNotMatch(html, /[–—]/);
});

test('no check yet reads as an empty state', async () => {
  const [{ default: React }, server, mod] = await Promise.all([
    import('react'), import('react-dom/server'), vite.ssrLoadModule('/src/components/admin/LinkHealth.jsx'),
  ]);
  const html = server.renderToStaticMarkup(React.createElement(mod.LinkHealth, { data: { totals: {} } }));
  assert.match(html, /data-links="empty"/);
});

test('drop and fix draft overrides the pipeline accepts; list positions and partners cannot', async () => {
  const { linkEntry, overridePath } = await vite.ssrLoadModule('/src/components/admin/linkFix.js');
  const drop = linkEntry(broken('image.url'), 'drop', { who: 'bas', today: '2026-11-07' });
  assert.deepEqual(drop.problems, []);
  assert.equal(drop.entry.id, 'rome');
  assert.deepEqual(drop.entry.patch, { 'image.url': null });
  assert.match(drop.entry.why, /404 on 2026-11-07/);
  assert.equal(drop.entry.source, 'https://upload.wikimedia.org/gone.jpg');

  const fix = linkEntry(broken('image.page'), 'fix', { who: 'bas', replacement: 'https://en.wikipedia.org/wiki/Roma', today: '2026-11-07' });
  assert.deepEqual(fix.entry.patch, { 'image.page': 'https://en.wikipedia.org/wiki/Roma' });
  // A fix with no new address is not ready.
  assert.ok(linkEntry(broken('image.page'), 'fix', { who: 'bas' }).problems.length > 0);
  // No name, no entry.
  assert.ok(linkEntry(broken('image.url'), 'drop', { who: '' }).problems.some((p) => p.field === 'who'));
  // A link inside a list, a partner page and a layer the overrides do not know.
  assert.equal(overridePath(broken('activities.items.0.link')), null);
  assert.equal(overridePath(broken('x', { where: [{ layer: 'partner', id: '', path: '' }] })), null);
  assert.equal(overridePath(broken('x', { where: [{ layer: 'region', id: 'AL01', path: 'editorial.u' }] })), null);
  assert.ok(linkEntry(broken('activities.items.0.link'), 'drop', { who: 'bas' }).problems.length > 0);
});
