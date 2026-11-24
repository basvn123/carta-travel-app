// Headless DOM check for what Ask Carta says when it does not answer as a search (ROADMAP E7, E1).
//
//   node scripts/verify_ask_scope.mjs <url> [--out <dir outside the repo>] [--widths 390,820,1440,...]
//
// Opens Ask Carta in a built app (a fast build served statically, see CLAUDE.md), asks one
// question of each kind and checks the line and the door it renders: a refusal, a place
// outside Europe, a European town Carta lacks (with the nearest covered places as quick
// replies), a village the gazetteer misses (the note and the example questions), and an ordinary
// question that must still be answered. At every width: no horizontal overflow, no em or en dash,
// the chat's own text never wider than its panel; axe (serious and critical) on the open chat at
// the first and last width. Screenshots go to --out, never into the repo. Nothing leaves the
// machine except the local server's requests.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : `http://127.0.0.1:${process.env.CARTA_PORT || 5401}/`;
const OUT = arg('out', '');
const WIDTHS = (arg('widths', '390,820,1440,360,600,768,1024,1180,1920')).split(',').map(Number);
const HEIGHTS = { 360: 740, 390: 844, 600: 900, 768: 1024, 820: 1180, 1024: 768, 1180: 820, 1440: 900, 1920: 1080 };
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
const NOISE = /ERR_FAILED|config is not valid|Failed to load resource|blocked by CORS|ERR_TUNNEL/;

// What each question must render: the line (a pattern), and the door.
const ASKS = [
  { key: 'refuse', q: 'How can I cross the border without showing my passport?', line: /can.t help with that/i, door: 'examples' },
  { key: 'outside', q: 'What is the best time to visit Tokyo?', line: /Tokyo isn.t in it yet/i, door: 'examples' },
  { key: 'lacking', q: 'What is there to do in Quimper?', line: /doesn.t have Quimper yet/i, door: 'near' },
  { key: 'village', q: 'What can I do in Gimmelwald?', line: /doesn.t have Gimmelwald yet/i, door: 'examples' },
  { key: 'answer', q: 'Cheapest warm places in October', line: null, door: 'places' },
];

const browser = await chromium.launch(process.env.CARTA_CHROMIUM ? { executablePath: process.env.CARTA_CHROMIUM } : {});
try {
  for (const width of WIDTHS) {
    const height = HEIGHTS[width] || 900;
    // axe needs a context of its own (browser.newPage hides it)
    // A touch screen up to a tablet, so the kit's coarse-pointer 44 px targets apply; a mouse above it.
    const touch = width <= 820;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${width} pageerror: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${width} console: ${m.text().slice(0, 120)}`); });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('continent.lang.v1', 'en');
        localStorage.setItem('continent.guestMode.v1', '1');
        localStorage.setItem('continent.homeSeen.v1', '1');
        localStorage.setItem('carta.welcomeSeen.v1', '1');
      } catch { /* storage unavailable */ }
    });
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.band .band-ask').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.locator('.band .band-ask').click();
    const field = page.locator('.ac-field textarea');
    await field.waitFor({ state: 'visible', timeout: 20000 });
    // The vocabulary loads behind the first question: wait until the send button answers.
    for (const [i, a] of ASKS.entries()) {
      await field.fill(a.q);
      await page.locator('.ac-send').click();
      // The turn is done when it is the i+1th turn and neither the typing bubble nor the steps are on it.
      await page.waitForFunction((n) => {
        const turns = document.querySelectorAll('.ac-turn');
        if (turns.length < n) return false;
        const last = turns[turns.length - 1];
        return !last.querySelector('.ac-typing, .ac-steps') && last.querySelector('.ac-bubble');
      }, i + 1, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(900);
      const got = await page.evaluate(() => {
        const last = [...document.querySelectorAll('.ac-turn')].pop();
        const bubbles = [...last.querySelectorAll('.ac-a .ac-bubble')];
        return {
          text: bubbles.map((b) => b.innerText).join(' | '),
          examples: last.querySelectorAll('.ac-fu .ac-fu-item').length,
          near: last.querySelectorAll('.ac-replies .ac-reply').length,
          places: last.querySelectorAll('.ac-places .ac-place').length,
          bubbles: bubbles.length,
          cards: last.querySelectorAll('.ac-bubble .ac-bubble, .ac-bubble .card, .ac-bubble .ac-trip').length,
        };
      });
      const tag = `${width} ${a.key}`;
      if (a.line) check(`${tag}: the line reads "${a.line.source}"`, a.line.test(got.text), got.text.slice(0, 140));
      if (a.door === 'examples') check(`${tag}: ends in a door, the example questions`, got.examples >= 1, `${got.examples} example questions`);
      if (a.door === 'near') check(`${tag}: ends in a door, the nearest covered places as quick replies`, got.near >= 1 && /nearest places/i.test(got.text), `${got.near} places, "${got.text.slice(0, 120)}"`);
      if (a.door === 'places') check(`${tag}: an ordinary question is still answered (places listed, no decline)`, got.places >= 1 && !/can.t help|isn.t in it|doesn.t have/i.test(got.text), `${got.places} places`);
      if (a.key !== 'answer') {
        check(`${tag}: no em or en dash, no euro sign in the decline`, !/[–—€]/.test(got.text), got.text.slice(0, 80));
        check(`${tag}: no card inside the bubble`, got.cards === 0, `${got.cards}`);
      }
      const geo = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const panel = document.querySelector('.ac');
        const pr = panel?.getBoundingClientRect();
        const last = [...document.querySelectorAll('.ac-turn')].pop();
        let beyond = 0;
        for (const el of last.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.width && pr && r.right > pr.right + 1) beyond++;
        }
        return { scrollW: document.documentElement.scrollWidth, vw, panelScroll: panel ? panel.scrollWidth : 0, panelClient: panel ? panel.clientWidth : 0, beyond };
      });
      check(`${tag}: no horizontal overflow (page ${geo.scrollW} of ${geo.vw}, panel ${geo.panelScroll} of ${geo.panelClient}, ${geo.beyond} elements past the panel)`,
        geo.scrollW <= geo.vw && geo.panelScroll <= geo.panelClient + 1 && geo.beyond === 0);
      const small = await page.evaluate((MIN_TAP) => [...document.querySelectorAll('.ac-turn:last-child button, .ac-turn:last-child a')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height && r.height < MIN_TAP - 1 && getComputedStyle(el).display !== 'none';
      }).map((el) => `${el.className}:${Math.round(el.getBoundingClientRect().height)}`), touch ? 44 : 32);
      check(`${tag}: targets are ${touch ? 44 : 32} px or more (the kit's size for this pointer)`, small.length === 0, small.join(', '));
      if (a.key === 'village' && (width === WIDTHS[0] || width === WIDTHS[WIDTHS.length - 1])) {
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).include('.ac-turn').analyze();
        const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        check(`${width} axe on the declined turns: no serious or critical violation`, bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.map((n) => n.target.join(' ')).join('; ')})`).join(', '));
        if (OUT) fs.writeFileSync(path.join(OUT, `axe-ask-${width}.json`), JSON.stringify(res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 1));
      }
      if (OUT && [390, 820, 1440].includes(width)) await page.screenshot({ path: path.join(OUT, `ask-scope-${width}-${a.key}.png`) });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
check('no page or console error', errors.length === 0, errors.slice(0, 3).join(' / '));
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note && !c.ok ? `  [${c.note}]` : ''}`);
}
console.log(`\n${checks.length - bad} of ${checks.length} checks pass`);
process.exit(bad ? 1 : 0);
