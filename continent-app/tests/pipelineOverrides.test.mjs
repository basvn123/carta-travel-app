// T1173 (ROADMAP I13): the admin Overrides tab lists the hand corrections in
// data/overrides/ (from the snapshot pipeline/apply_overrides.py writes) and
// drafts a new one as a layer file, a JSON Patch and pull request text, under
// the same rules as the pipeline step. It is routed as an admin tab.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import {
  draftProblems, buildEntry, layerFile, jsonPatch, prText, parseValue, emptyDraft,
} from '../src/components/admin/pipelineOverrides.js';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const snapshot = JSON.parse(readFileSync(new URL('../src/admin/pipelineOverrides.json', import.meta.url), 'utf8'));

const good = {
  ...emptyDraft('2026-11-06'),
  layer: 'lake', id: 'hallstaetter-see', path: 'name', value: 'Hallstaetter See',
  who: 'bas', why: 'The OSM name carried the English exonym.', source: 'https://www.openstreetmap.org/relation/1',
};

const fixture = {
  generated_at: '2026-11-06T18:00:00Z',
  about: { dest: 'Hand corrections to the dest layer.' },
  counts: { dest: 2, beach: 0, lake: 0, mountain: 0 },
  overrides: [
    { layer: 'dest', id: 'hallstatt', patch: { blurb: 'Lakeside salt town.' }, who: 'bas', when: '2026-11-05',
      why: 'The intro named the wrong lake.', source: 'https://en.wikipedia.org/wiki/Hallstatt', review_by: null, status: 'applied' },
    { layer: 'dest', id: 'gone-town', patch: { blurb: 'x' }, who: 'bas', when: '2026-11-01',
      why: 'Kept after the pipeline dropped it.', source: 'site visit 2026-10', review_by: '2027-01-01', status: 'orphan' },
  ],
};

async function load() {
  const [{ default: React }, server, mod] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/components/admin/PipelineOverrides.jsx'),
  ]);
  return (props) => server.renderToStaticMarkup(React.createElement(mod.PipelineOverrides, props));
}

test('a complete draft passes the rules and builds the entry the pipeline expects', () => {
  assert.deepEqual(draftProblems(good), []);
  const entry = buildEntry(good);
  assert.deepEqual(entry, {
    id: 'hallstaetter-see', patch: { name: 'Hallstaetter See' }, who: 'bas', when: '2026-11-06',
    why: 'The OSM name carried the English exonym.', source: 'https://www.openstreetmap.org/relation/1',
  });
  for (const k of ['who', 'when', 'why', 'source']) assert.ok(entry[k], `entry carries ${k}`);
});

test('the rules mirror pipeline/apply_overrides.py', () => {
  const fields = (d) => draftProblems({ ...good, ...d }).map((p) => p.field);
  assert.deepEqual(fields({ who: '' }), ['who']);
  assert.deepEqual(fields({ source: ' ' }), ['source']);
  assert.deepEqual(fields({ why: 'short' }), ['why']);
  assert.deepEqual(fields({ when: '2026-02-30' }), ['when']);
  assert.deepEqual(fields({ path: 'id' }), ['path']);
  assert.deepEqual(fields({ path: 'a b' }), ['path']);
  assert.deepEqual(fields({ path: 'costs.daily' }), ['path']);
  assert.deepEqual(fields({ path: 'score' }), ['path']);
  assert.deepEqual(fields({ why: 'From 3\u20135 km, which was wrong.' }), ['why']);
  assert.deepEqual(fields({ kind: 'number', value: 'ten' }), ['value']);
  // The same field on the same item is refused: edit the existing entry.
  assert.deepEqual(draftProblems({ ...good, layer: 'dest', id: 'hallstatt', path: 'blurb' }, fixture.overrides)
    .map((p) => p.field), ['path']);
  assert.deepEqual(parseValue('yes or no', 'Yes'), { value: true });
  assert.deepEqual(parseValue('JSON', '["a"]'), { value: ['a'] });
});

test('the outputs: layer file keeps existing entries, JSON Patch appends, PR text names who, why and source', () => {
  const entry = buildEntry({ ...good, layer: 'dest', id: 'graz', path: 'blurb', value: 'Graz.' });
  const file = layerFile(fixture, 'dest', entry);
  assert.equal(file.layer, 'dest');
  assert.equal(file.about, fixture.about.dest);
  assert.deepEqual(file.overrides.map((e) => e.id), ['hallstatt', 'gone-town', 'graz']);
  assert.equal(file.overrides[1].review_by, '2027-01-01');
  assert.ok(!('status' in file.overrides[0]), 'status is snapshot state, not file content');
  assert.deepEqual(jsonPatch(entry), [{ op: 'add', path: '/overrides/-', value: entry }]);
  const { title, body } = prText('dest', entry);
  assert.equal(title, 'Override: dest graz blurb');
  for (const s of ['data/overrides/dest.json', 'Who: bas', 'Why: The OSM', 'Source: https://']) assert.ok(body.includes(s), s);
  assert.doesNotMatch(title + body, /[\u2013\u2014]/);
});

test('the list renders every override with its status and the orphan stands out', async () => {
  const render = await load();
  const html = render({ data: fixture });
  assert.match(html, /data-overrides="list"/);
  assert.equal((html.match(/data-override="/g) || []).length, 2);
  assert.match(html, /data-override="dest\/hallstatt"/);
  assert.match(html, /data-status="orphan"[^>]*>Item no longer in the output/);
  assert.match(html, /<a href="https:\/\/en.wikipedia.org\/wiki\/Hallstatt"/);
  assert.match(html, /data-count="dest"><b>2<\/b>/);
  assert.match(html, /data-overrides="draft"/);
  assert.doesNotMatch(html, /data-overrides="output"/, 'no output before a draft is checked');
  assert.doesNotMatch(html, /[\u2013\u2014]/, 'no en or em dashes');
});

test('a checked draft shows the entry, the downloads and the PR text; a bad one names each field', async () => {
  const render = await load();
  const html = render({ data: fixture, initialDraft: good });
  assert.match(html, /data-draft="ready"/);
  assert.match(html, /data-out="entry"/);
  assert.match(html, /data-action="download"><span class="btn-label">Download lake\.json/);
  assert.match(html, /data-action="download-patch"/);
  assert.match(html, /data-out="pr">Override: lake hallstaetter-see name/);

  const bad = render({ data: fixture, initialDraft: { ...good, who: '', why: 'x' } });
  assert.match(bad, /data-draft="incomplete"/);
  assert.match(bad, /data-problem="ov2-who"/);
  assert.match(bad, /data-problem="ov2-why"/);
  assert.match(bad, /aria-invalid="true"/);
  assert.doesNotMatch(bad, /data-overrides="output"/);
});

test('the shipped snapshot renders (empty today) and the tab is routed', async () => {
  const render = await load();
  const html = render({});
  assert.equal(snapshot.overrides.length === 0, /data-overrides="empty"/.test(html));
  const page = readFileSync(new URL('../src/admin/AdminPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /'overrides'/);
  assert.match(page, /section === 'overrides' && <PipelineOverrides/);
  const en = readFileSync(new URL('../src/i18n/en.js', import.meta.url), 'utf8');
  assert.match(en, /'admin\.nav\.overrides': 'Overrides'/);
});

test('T1214 (T1173-h): an entry past review_by is flagged and a live override on the same item is shown', async () => {
  const { reviewDue, liveFor } = await import('../src/components/admin/pipelineOverrides.js');
  const row = fixture.overrides[1];
  assert.equal(reviewDue(row, '2026-12-31'), false);
  assert.equal(reviewDue(row, '2027-01-02'), true);
  assert.equal(reviewDue(fixture.overrides[0], '2030-01-01'), false); // no review_by
  const live = [{ layer: 'dest', itemId: 'gone-town', patch: { blurb: 'y', name: 'z' } }, { layer: 'lake', itemId: 'gone-town', patch: {} }];
  assert.deepEqual(liveFor(row, live).map((o) => o.layer), ['dest']);
  const render = await load();
  const html = render({ data: fixture, live, today: '2027-01-02' });
  assert.match(html, /data-review="due">Review was due 2027-01-01/);
  assert.match(html, /data-live="dest\/gone-town"[^>]*>Also a live override in the Content tab \(blurb, name\)/);
  assert.match(html, /data-count="review-due"><b>1<\/b>/);
  assert.match(html, /data-count="live"><b>2<\/b>/);
  const before = render({ data: fixture, today: '2026-12-01' });
  assert.doesNotMatch(before, /data-review="due"/);
  assert.match(before, /review by 2027-01-01/);
});
