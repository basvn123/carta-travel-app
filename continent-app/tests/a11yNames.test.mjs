// T1128 (ROADMAP G10): accessible names hold the words on screen.
// scripts/verify_axe.mjs runs axe-core on every surface in a browser; these
// render checks pin the fixes it led to, so they hold without a browser:
// a control's name contains its visible text in order (WCAG 2.5.3), no name
// on a role that cannot carry one, and no unnamed image.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

async function load() {
  const [{ default: React }, server, badge, motion, spark, i18n] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/components/RatingBadge.jsx'),
    vite.ssrLoadModule('/src/browse/home/motionKit.jsx'),
    vite.ssrLoadModule('/src/components/admin/Sparkbars.jsx'),
    vite.ssrLoadModule('/src/i18n/index.jsx'),
  ]);
  const h = React.createElement;
  const html = (el) => server.renderToStaticMarkup(i18n.I18nProvider ? h(i18n.I18nProvider, {}, el) : el);
  return { h, html, ...badge, ...motion, ...spark };
}

// The words a reader sees or hears, as axe tokenises them: lower case, no
// parentheticals, letters and digits only.
const tokens = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\([^()]*\)/g, ' ').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const contains = (name, part) => {
  const n = tokens(name).join(' ');
  return ` ${n} `.includes(` ${tokens(part).join(' ')} `);
};

test('a score chip inside a link reads its figure and word first', async () => {
  const { h, html, ScoreChip } = await load();
  const rating = { score: 9.1, tier: 3 };
  const out = html(h(ScoreChip, { rating, size: 'lg', band: true, asText: true }));
  assert.doesNotMatch(out, /role="img"/, 'no image role, so the link takes its name from the text');
  assert.doesNotMatch(out, /aria-hidden="true">9/, 'the figure is not hidden');
  const visible = out.replace(/<span class="sr-only">.*?<\/span>/, '');
  assert.ok(contains(out, visible), `name "${tokens(out).join(' ')}" holds "${tokens(visible).join(' ')}"`);
  assert.match(out, /out of 10/);
  // Elsewhere it stays one named image.
  assert.match(html(h(ScoreChip, { rating })), /role="img" aria-label="Rated /);
});

test('a split headline carries no aria-label on a paragraph', async () => {
  const { h, html, MaskedText } = await load();
  const out = html(h(MaskedText, { as: 'p', className: 'hm-kick', parts: ['Everything in one place'] }));
  assert.doesNotMatch(out, /^<p[^>]*aria-label/);
  assert.match(out, /<span class="sr-only">Everything in one place<\/span>/);
});

test('an empty sparkline is decoration, not an unnamed image', async () => {
  const { h, html, Sparkbars } = await load();
  const empty = html(h(Sparkbars, { series: [] }));
  assert.doesNotMatch(empty, /role="img"/);
  assert.match(empty, /aria-hidden="true"/);
  const full = html(h(Sparkbars, { series: [{ day: '2026-11-01', n: 3 }] }));
  assert.match(full, /role="img" aria-label="2026-11-01: 3"/);
});
