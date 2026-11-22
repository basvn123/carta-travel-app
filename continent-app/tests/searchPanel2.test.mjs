// G12 round 2 (decision.md APPROVED 2026-11-19, O1 to O5): the search panel's
// sections, its honest second lines, Ask as a panel or sheet, the desktop
// List | Map switch and the band's one gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const has = (lang, key) => new RegExp(`["']${key.replace(/\./g, '\\.')}["']:`).test(read(`src/i18n/${lang}.js`));

test('suggestions say a name and its place: no counts, no "in Carta", no "not covered" (O4, O5)', () => {
  const panel = read('src/browse/search/SearchPanel.jsx');
  for (const k of ['search.subPlace', 'search.subNear', 'search.nPlaces', 'search.onePlace', 'search.youSearchAs']) {
    assert.doesNotMatch(panel, new RegExp(`'${k.replace('.', '\\.')}'`), k);
    for (const l of LANGS) assert.equal(has(l, k), false, `${l} ${k}`);
  }
  assert.match(panel, /if \(it\.type === 'place' \|\| it\.type === 'near'\) return country;/);
  for (const l of LANGS) assert.doesNotMatch(read(`src/i18n/${l}.js`), /Carta does not cover yet/);
});

test('Browse, Recent and Places; on a phone Filters and Ask are their own group (O3)', () => {
  const panel = read('src/browse/search/SearchPanel.jsx');
  assert.match(panel, /group\('g3', t\('search\.browse'\)/);
  assert.match(panel, /filters\?\.applyShortcut\(it\.shortcut, !it\.on\)/);
  // The phone's actions are buttons outside the listbox.
  const actions = panel.slice(panel.indexOf('const actions'), panel.indexOf('const status'));
  assert.match(actions, /className="sp-actions" role="group"/);
  assert.doesNotMatch(actions, /role="option"/);
  assert.match(panel, /<\/div>\s*\{actions\}/);
  // A desktop still ends a typed list with "Ask Carta about ...", a phone never in the list.
  assert.match(panel, /const askItem = typing && isDesktop \?/);
  for (const l of LANGS) for (const k of ['search.browse', 'search.moreWays', 'band.filters', 'band.filtersOn']) assert.ok(has(l, k), `${l} ${k}`);
});

test('Ask opens a side panel on a desktop and a sheet on a phone, and leaves animated', () => {
  const chat = read('src/browse/ask/AskChat.jsx');
  assert.match(chat, /className=\{`ac-scrim\$\{leaving \? ' is-leaving' : ''\}`\}/);
  const css = read('src/styles/76-ask-chat.css');
  assert.match(css, /\.ac\.is-phone \{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ var\(--space-7\)\)/);
  assert.doesNotMatch(css, /\.ac\.is-phone \{[^}]*height: 100dvh/);
  assert.match(read('src/browse/ask/AskChatButton.jsx'), /leaving=\{leaving\}/);
});

test('the desktop tab row closes with the List | Map switch; tabs take their word width', () => {
  const cats = read('src/browse/ExploreCategories.jsx');
  assert.match(cats, /<div ref=\{lineRef\} className=\{`xcats-line\$\{more\.start \? ' has-start' : ''\}\$\{more\.end \? ' has-end' : ''\}`\}>/);
  assert.match(cats, /value=\{view === 'map' \? 'map' : 'list'\} onChange=\{onView\}/);
  const css = read('src/styles/80-band.css');
  assert.match(css, /\.xcats-line \.xcats-row \.ui-tab,[\s\S]*?flex: none;/);
  assert.doesNotMatch(css, /margin-left: calc\(var\(--space-3\) \* -1\)/);
  // One gap (O1): the line's room under the field and the strip's under the phone field.
  // content-box: an empty line on a layer tab keeps the same height (round 2 smoothness).
  assert.match(css, /\.band\.is-desk \.band-line \{\s*box-sizing: content-box;\s*min-height: 32px;\s*padding: 9px/);
  assert.match(css, /\.band\.is-phone > \.band-strip \{[^}]*padding-top: 10px;/);
});
