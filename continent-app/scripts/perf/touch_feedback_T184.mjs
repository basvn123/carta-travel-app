// Touch feedback audit (task T184, G1).
//
//   BASE=http://127.0.0.1:5209 node scripts/perf/touch_feedback_T184.mjs
//
// Every control a finger can land on must change visibly while it is held,
// before any data arrives. This harness opens three screens on a phone profile
// (390x844, touch), lists the visible controls, forces the :active state on each
// through the DevTools protocol (so no click handler runs and no data is
// needed), and compares the computed style of the control and its direct
// children before and after. A control with no difference "does not respond".
// The same pass reads the transition time on the properties that changed, because
// feedback that takes 300 ms to show is not inside 100 ms.
//
// A control is any visible element that is a button, a link, a summary, a label
// for an input, a range input, has a button-like ARIA role, or whose computed
// cursor is pointer. Controls are grouped by tag plus first class so a list of
// forty identical cards is one finding, with its count.
//
// Results go to reports/touch_feedback_T184.json (set OUT to change it).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.BASE || 'http://127.0.0.1:5209';
const OUT = process.env.OUT || path.join(APP, 'reports', 'touch_feedback_T184.json');

const SCREENS = [
  { key: 'explore', url: '/', settle: async (p) => { await p.waitForTimeout(9000); } },
  {
    key: 'destination', url: '/#dest=gem:valbona',
    settle: async (p) => {
      await p.locator('.destp').waitFor({ timeout: 120000 });
      await p.waitForTimeout(3000);
      const folds = p.locator('.dsec-toggle:visible');
      const n = Math.min(await folds.count(), 6);
      for (let i = 0; i < n; i += 1) await folds.nth(i).click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(800);
    },
  },
  {
    key: 'trip', url: '/#itin=at-salzburg-vienna-chain-6d',
    settle: async (p) => {
      await p.locator('.itin-photohero').first().waitFor({ timeout: 120000 }).catch(() => {});
      await p.waitForTimeout(3000);
      const folds = p.locator('.dsec-toggle:visible');
      const n = Math.min(await folds.count(), 6);
      for (let i = 0; i < n; i += 1) await folds.nth(i).click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(800);
    },
  },
];

const SEEDS = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
};

// Runs in the page. Tags each control with data-t184 and returns its group.
const COLLECT = () => {
  const PROPS = ['transform', 'opacity', 'backgroundColor', 'color', 'borderTopColor',
    'boxShadow', 'filter', 'outlineStyle', 'textDecorationLine', 'scale'];
  window.__PROPS = PROPS;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    if (cs.opacity === '0') return false;
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight * 6 && r.left < innerWidth * 6;
  };
  const sel = 'button, a[href], summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], input[type="range"], input[type="checkbox"], input[type="radio"], label, [onclick], [tabindex="0"]';
  const found = new Set(document.querySelectorAll(sel));
  for (const el of document.querySelectorAll('#root *')) {
    if (found.has(el)) continue;
    if (getComputedStyle(el).cursor === 'pointer') found.add(el);
  }
  // Keep the outermost control of a nest so one control is counted once.
  const all = [...found].filter((el) => vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el) && o.matches('button, a[href], summary, [role="button"]')));
  const groups = {};
  let i = 0;
  for (const el of outer) {
    if (el.closest('.maplibregl-map') && !el.matches('button')) continue;
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean)[0] || '';
    const g = `${el.tagName.toLowerCase()}.${cls}`;
    (groups[g] = groups[g] || []).push(el);
  }
  const picked = [];
  for (const [g, els] of Object.entries(groups)) {
    els.slice(0, 2).forEach((el) => {
      el.setAttribute('data-t184', String(i));
      picked.push({ g, id: i, count: els.length });
      i += 1;
    });
  }
  return picked;
};

// Runs in the page for one control: style of it and its direct children.
const SNAP = (id) => {
  const el = document.querySelector(`[data-t184="${id}"]`);
  if (!el) return null;
  const read = (e, pseudo) => {
    const cs = getComputedStyle(e, pseudo || null);
    const o = {};
    for (const p of window.__PROPS) o[p] = cs[p];
    o.__transition = cs.transitionDuration + '|' + cs.transitionProperty + '|' + cs.transitionDelay;
    o.__animation = cs.animationName;
    return o;
  };
  const out = { self: read(el), kids: [...el.children].slice(0, 6).map((k) => read(k)) };
  if (el.matches('input[type="range"]')) {
    out.thumb = read(el, '::-webkit-slider-thumb');
  }
  return out;
};

function differs(a, b) {
  const changed = [];
  const cmp = (x, y, tag) => {
    for (const k of Object.keys(x)) {
      if (k.startsWith('__')) continue;
      if (x[k] !== y[k]) changed.push(`${tag}.${k}`);
    }
  };
  cmp(a.self, b.self, 'self');
  a.kids.forEach((k, i) => b.kids[i] && cmp(k, b.kids[i], `kid${i}`));
  if (a.thumb && b.thumb) cmp(a.thumb, b.thumb, 'thumb');
  return changed;
}

// Longest transition time, in ms, on the properties that changed.
function slowest(snap, changed) {
  const dur = (s) => {
    const [d, props, delay] = s.__transition.split('|');
    const ms = (x) => Math.max(...x.split(',').map((t) => { t = t.trim(); return t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000; }));
    return { d: ms(d) + ms(delay), props };
  };
  let worst = 0;
  for (const c of changed) {
    const [who] = c.split('.');
    const s = who === 'self' ? snap.self : who === 'thumb' ? snap.thumb : snap.kids[Number(who.slice(3))];
    if (s) worst = Math.max(worst, dur(s).d);
  }
  return worst;
}

const browser = await chromium.launch();
const result = { base: BASE, at: new Date().toISOString(), screens: {} };
let totalGroups = 0;
let totalMissing = 0;
let totalSlow = 0;
for (const sc of SCREENS) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.addInitScript(SEEDS);
  await page.goto(BASE + sc.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sc.settle(page);
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' }).catch(() => {});
  const picked = await page.evaluate(COLLECT);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument', { depth: 0 });
  const rows = [];
  for (const c of picked) {
    const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-t184="${c.id}"]` });
    if (!q.nodeId) continue;
    const before = await page.evaluate(SNAP, c.id);
    await cdp.send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: ['active'] });
    await page.waitForTimeout(450);
    const after = await page.evaluate(SNAP, c.id);
    await cdp.send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: [] });
    if (!before || !after) continue;
    const changed = differs(before, after);
    const ms = changed.length ? slowest(after, changed) : 0;
    const info = await page.evaluate((id) => {
      const e = document.querySelector(`[data-t184="${id}"]`);
      return (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    }, c.id);
    rows.push({ group: c.g, count: c.count, label: info, changed, ms, responds: changed.length > 0, inside100: changed.length > 0 && ms <= 100 });
  }
  const missing = rows.filter((r) => !r.responds);
  const slow = rows.filter((r) => r.responds && !r.inside100);
  result.screens[sc.key] = { groups: rows.length, responds: rows.length - missing.length, missing, slow };
  totalGroups += rows.length;
  totalMissing += missing.length;
  totalSlow += slow.length;
  console.log(`${sc.key}: ${rows.length} control groups, ${missing.length} do not respond, ${slow.length} respond slower than 100 ms`);
  for (const m of missing) console.log(`  MISSING ${m.group} x${m.count} "${m.label}"`);
  for (const m of slow) console.log(`  SLOW ${m.group} x${m.count} ${m.ms} ms "${m.label}"`);
  await ctx.close();
}
result.totals = { groups: totalGroups, missing: totalMissing, slow: totalSlow };
console.log(`TOTAL ${totalGroups} groups, ${totalMissing} missing, ${totalSlow} slow`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
await browser.close();
