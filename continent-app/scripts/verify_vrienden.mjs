/**
 * Vrienden proof (G16, decision 0017). For each ?friendsmock variant, width
 * and language it opens Vrienden straight from the address and checks, in
 * the panel: no page error, no horizontal overflow, no clipped visible text,
 * every target at least 44 px, every photo sharp (the chosen file at least
 * its drawn width times the device pixel ratio, at a 2x screen), every photo
 * on a row of cards at one top and one height, at most one saffron mark, an
 * h1, axe serious and critical 0, layout shift under 0.05, and that nothing
 * animates at the first paint (a deep link shows end states).
 *
 * Version 3 (one timeline) adds, on the home variants: one sticky element at
 * most below 1100 px, the status line exists, no .vr-me-door and no "Vraag
 * om mee te gaan" on the home, every card photo at 3:2 (the soonest overlap
 * at 2:1 from 1100), every date plate on its card's top (above it from
 * 1100). The example variant opens ?friendsmock=empty, presses "Bekijk een
 * voorbeeld", checks the example bar shows, and that nothing is written to
 * storage and no request but a GET for a file goes out from then on.
 *
 * Needs a build with VITE_E2E_SEAMS=1 served with the data:
 *   node scripts/verify_vrienden.mjs --port 5853 [--widths 360,390] [--variants rich,vote]
 *     [--langs nl,en] [--out <dir>] [--shots]
 * --shots saves <variant>-<lang>-<w>.png at 390 and 1440 (and every failure).
 * Exit code 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5853');
const WIDTHS = arg('widths', '360,390,820,1180,1440').split(',').map(Number);
const LANGS = arg('langs', 'nl,en,de,fr,es,it').split(',');
const OUT = path.resolve(arg('out', 'verify-vrienden'));
const SHOTS = process.argv.includes('--shots');
const CONC = Number(arg('conc', '3'));
fs.mkdirSync(OUT, { recursive: true });

const VARIANTS = {
  rich: '?tab=together&friendsmock',
  one: '?tab=together&friendsmock=one',
  empty: '?tab=together&friendsmock=empty',
  example: '?tab=together&friendsmock=empty',
  many: '?tab=together&friendsmock=many',
  invite: '?tab=together&friendsmock&tv=invite',
  guest: '?tab=together&friendsmock=guest#friend=sam_m',
  me: '?tab=together&friendsmock&tv=me&badgemock=some',
  circle: '?tab=together&friendsmock=circle&tv=circle&tg=c-unif',
  vote: '?tab=together&friendsmock=circle&tv=circlevote&tg=c-unif',
  dates: '?tab=together&friendsmock=circle&tv=circledates&tg=c-unif',
  flights: '?tab=together&friendsmock=circle&tv=circleflights&tg=c-unif',
  pick: '?tab=together&friendsmock=circle&tv=circlepick&tg=c-unif',
  newcircle: '?tab=together&friendsmock&tv=newcircle',
};
const PICK = arg('variants', Object.keys(VARIANTS).join(',')).split(',');
const HOME = new Set(['rich', 'one', 'empty', 'example', 'many', 'invite']);
const LOCALE = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' };

async function open(browser, v, w, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 }, deviceScaleFactor: 2, locale: LOCALE[lang] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((lg) => {
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.lang.v1', lg);
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  }, lang);
  // Dutch never shows an English place name, not even for a moment (judge 3
  // fix 1): the page is read every 100 ms for its first 4 s.
  if (lang === 'nl') {
    await page.addInitScript(() => {
      window.__englishSeen = [];
      const t0 = performance.now();
      const id = setInterval(() => {
        const p = document.querySelector('.tg-panel');
        const m = p && p.innerText.match(/\b(Lisbon|Ghent|Seville|Naples|Florence)\b/);
        if (m) window.__englishSeen.push(`${m[1]} at ${Math.round(performance.now() - t0)} ms`);
        if (performance.now() - t0 > 4000) clearInterval(id);
      }, 100);
    });
  }
  await page.goto(`http://127.0.0.1:${PORT}/${VARIANTS[v]}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.vr-panel, .tg-panel').first().waitFor({ timeout: 25000 });
  // First paint: no figure may be animating now.
  const firstAnims = await page.evaluate(() => {
    const p = document.querySelector('.tg-panel');
    return document.getAnimations().filter((a) => a.effect?.target && p?.contains(a.effect.target) && a.playState === 'running')
      .map((a) => `${a.animationName || a.constructor.name} on ${String(a.effect.target.className).split(' ')[0]}`);
  });
  await page.waitForTimeout(1800);
  let sent = null;
  if (v === 'example') {
    // From the press on, every storage write and every request but a GET
    // for a file counts as something the example saved or sent.
    sent = [];
    await page.evaluate(() => {
      window.__writes = [];
      for (const st of [localStorage, sessionStorage]) {
        const set = st.setItem.bind(st);
        st.setItem = (k, val) => { window.__writes.push(k); return set(k, val); };
      }
    });
    page.on('request', (r) => {
      const u = r.url();
      if (r.method() !== 'GET' || /supabase|\/functions\/|\/api\//.test(u)) sent.push(`${r.method()} ${u.slice(0, 80)}`);
    });
    await page.locator('.vr-first .btn').first().click();
    await page.locator('.mt-exbar').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
  }
  return { ctx, page, errors, firstAnims, sent };
}

/* Version 3 rules on the home (see the header). */
async function timelineRules(page, v) {
  return page.evaluate((variant) => {
    const root = document.querySelector('.tg-panel');
    const out = [];
    const wide = window.innerWidth >= 1100;
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    if (!wide) {
      const sticky = [...root.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'sticky' && vis(el));
      if (sticky.length > 1) out.push(`sticky ${sticky.length}: ${sticky.map((el) => String(el.className).split(' ')[0]).join(',')}`);
    }
    if (!root.querySelector('.vr-status[role="status"]')) out.push('no status line');
    if (root.querySelector('.vr-me-door')) out.push('.vr-me-door present');
    if (/Vraag om mee te gaan/.test(root.innerText) || root.querySelector('.vr-go-ask')) out.push('Vraag om mee te gaan on the home');
    const cards = [...root.querySelectorAll('.vr-m-ph')].filter(vis);
    for (const ph of cards) {
      const r = ph.getBoundingClientRect();
      const isWide = wide && ph.closest('.vr-mo.is-wide');
      const want = isWide ? 2 : 1.5;
      if (Math.abs(r.width / r.height - want) > 0.03) out.push(`photo ${Math.round(r.width)}x${Math.round(r.height)} not ${isWide ? '2:1' : '3:2'}`);
    }
    for (const li of root.querySelectorAll('.vr-mo')) {
      const plate = li.querySelector(':scope > .vr-gut .vr-plate');
      const card = li.querySelector(':scope > .vr-m');
      if (!plate || !card || !vis(plate)) continue;
      const p = plate.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      if (wide ? p.bottom > c.top + 1 : Math.abs(p.top - c.top) > 1) out.push(`plate ${Math.round(p.top)} vs card ${Math.round(c.top)}`);
    }
    // Judge v3-1 fix 2: from 1100 px no hole in a grid of moments before its
    // last row (each column is covered at the top of every row), and no
    // void over 200 px between two cards in one column.
    if (wide) {
      for (const grid of [root.querySelector('.vr-main'), root.querySelector('.vr-band.is-undated')]) {
        if (!grid || getComputedStyle(grid).display !== 'grid') continue;
        const g = grid.getBoundingClientRect();
        const widths = getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat);
        const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
        const xs = [];
        widths.reduce((x, w) => { xs.push(x + w / 2); return x + w + gap; }, g.left);
        const items = [...grid.querySelectorAll('.vr-mo')]
          .filter((li) => vis(li) && (grid.matches('.is-undated') || !li.closest('.is-undated'))).map((li) => li.getBoundingClientRect());
        const tops = [...new Set(items.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
        const rowTops = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 4);
        for (const t of rowTops.slice(0, -1)) {
          for (const x of xs) {
            if (!items.some((r) => r.left <= x && r.right >= x && r.top <= t + 5 && r.bottom >= t + 5)) out.push(`hole at row ${Math.round(t - g.top)} column ${xs.indexOf(x) + 1}`);
          }
        }
        for (const x of xs) {
          const col = items.filter((r) => r.left <= x && r.right >= x).sort((a, b) => a.top - b.top);
          for (let i = 1; i < col.length; i += 1) if (col[i].top - col[i - 1].bottom > 200) out.push(`void ${Math.round(col[i].top - col[i - 1].bottom)} px in column ${xs.indexOf(x) + 1}`);
        }
      }
    }
    // Judge v3-1 fix 1: with nobody, no face but yours and no next trip; with
    // one friend, only that friend (Sam Martens, SM).
    const allowed = { empty: [], one: ['SM'] }[variant];
    if (allowed) {
      const faces = [...root.querySelectorAll('.frn-face')].filter((f) => vis(f) && !f.classList.contains('tg-tone-you'))
        .map((f) => f.textContent.trim()).filter((x) => x && !allowed.includes(x));
      if (faces.length) out.push(`faces of people who are not friends: ${[...new Set(faces)].join(',')}`);
      if (variant === 'empty' && root.querySelector('.vr-status-r')) out.push('status names a next trip with no friends');
    }
    return out;
  }, v);
}

const SAFFRON = 'rgb(242, 179, 61)';

async function inspect(page) {
  return page.evaluate((saffron) => {
    const root = document.querySelector('.tg-panel');
    const out = { overflow: 0, clipped: [], small: [], blurry: [], saffron: 0, h1: 0 };
    const d = document.documentElement;
    out.overflow = Math.max(d.scrollWidth - d.clientWidth, root ? root.scrollWidth - root.clientWidth : 0);
    const scope = [root, document.querySelector('.vr-sheet-wrap')].filter(Boolean);
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const all = scope.flatMap((r) => [r, ...r.querySelectorAll('*')]);
    out.h1 = all.filter((el) => el.tagName === 'H1' && vis(el)).length;
    const scrollers = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX)) return true; } return false; };
    let bestSeen = false;
    for (const el of all) {
      if (!vis(el)) continue;
      const s = getComputedStyle(el);
      // Clipped text: an element that cuts its own text (ellipsis or hidden).
      if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        && (s.overflow === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1
        && !el.closest('.vr-linkbox-t, .sr-only, .vr-live')) {
        out.clipped.push(`${el.className || el.tagName}: ${el.textContent.trim().slice(0, 30)}`);
      }
      const tag = el.tagName;
      if ((tag === 'BUTTON' || (tag === 'A' && el.hasAttribute('href')) || tag === 'SELECT' || (tag === 'INPUT' && el.type !== 'hidden'))
        && !el.closest('.tg-qr')) {
        const r = el.getBoundingClientRect();
        if ((r.width < 43.5 || r.height < 43.5) && !scrollers(el)) out.small.push(`${tag}.${String(el.className).split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} ${el.textContent.trim().slice(0, 20)}`);
        else if (r.width < 43.5 || r.height < 43.5) out.small.push(`${tag}.${String(el.className).split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const isSaffron = [s.borderTopColor, s.backgroundColor, s.color, s.outlineColor].includes(saffron)
        && (s.borderTopWidth !== '0px' || s.backgroundColor === saffron || s.color === saffron);
      if (isSaffron) {
        if (el.classList.contains('vr-best')) { if (!bestSeen) { bestSeen = true; out.saffron += 1; } } else out.saffron += 1;
      }
    }
    return out;
  }, SAFFRON);
}

/* The photo rule (judge 1 fix 5): the file the browser chose is at least
 * the drawn width times the device pixel ratio (the run is at 2x). It was 1.5
 * times; a 2x screen needs every pixel. An <img> with a w-descriptor srcset reports a
 * density-corrected naturalWidth, so the chosen file is loaded again on its
 * own to read its real pixels. */
async function sharpness(page) {
  return page.evaluate(async () => {
    const root = document.querySelector('.tg-panel');
    const imgs = [...(root?.querySelectorAll('img') || [])].filter((el) => el.complete && el.currentSrc && el.getBoundingClientRect().width > 0);
    const out = [];
    await Promise.all(imgs.map((el) => new Promise((done) => {
      const probe = new Image();
      probe.onload = () => {
        const w = el.getBoundingClientRect().width;
        const dpr = window.devicePixelRatio || 1;
        if (probe.naturalWidth < w * dpr - 1) out.push(`${probe.naturalWidth}<${Math.round(w)}x${dpr} ${el.currentSrc.split('/').pop().slice(0, 40)}`);
        done();
      };
      probe.onerror = () => done();
      probe.src = el.currentSrc;
    })));
    return out;
  });
}

/* Photo rows (judge 1 fix 6): in the rail, the friend grid and the kring
 * rail, every photo box on one row of cards has the same top and the same
 * height (1 px or less), whatever the photo inside it is. */
async function photoRows(page) {
  return page.evaluate(() => {
    const out = [];
    // v3: the desktop grid of moments (the soonest overlap at 2:1 is left out).
    const groups = [['.vr-main', '.vr-mo:not(.is-wide)', '.vr-m-ph']];
    for (const [wrap, card, ph] of groups) {
      for (const w of document.querySelectorAll(`.tg-panel ${wrap}`)) {
        if (getComputedStyle(w).display !== 'grid' || getComputedStyle(w).gridTemplateColumns.split(' ').length < 2) continue;
        const rows = new Map();
        for (const c of w.querySelectorAll(card)) {
          const box = c.querySelector(ph);
          if (!box) continue;
          const cr = c.getBoundingClientRect();
          if (!cr.width) continue;
          const k = Math.round(cr.top / 8);
          const r = box.getBoundingClientRect();
          if (!rows.has(k)) rows.set(k, []);
          // A photo fills its box; a face tile or the ring holds other things.
          // The img, not its picture: the app draws picture as display: contents.
          const pic = box.matches('.vr-ring') ? null : box.querySelector('img, .hero-blank');
          rows.get(k).push({ top: r.top, h: r.height, inner: pic ? pic.getBoundingClientRect().height : r.height });
        }
        for (const row of rows.values()) {
          if (row.length < 2) continue;
          const t0 = row[0].top; const h0 = row[0].h;
          for (const x of row) {
            if (Math.abs(x.top - t0) > 1 || Math.abs(x.h - h0) > 1 || Math.abs(x.inner - x.h) > 1) {
              out.push(`${wrap} top ${Math.round(x.top - t0)} height ${Math.round(x.h - h0)} fill ${Math.round(x.inner - x.h)}`);
            }
          }
        }
      }
    }
    return out;
  });
}

async function axe(page) {
  const r = await new AxeBuilder({ page }).include('.tg-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')
    .map((x) => `${x.id}(${x.nodes.length}): ${x.nodes[0]?.target?.join(' ')}`);
}

async function runOne(browser, v, w, lang) {
  const { ctx, page, errors, firstAnims, sent } = await open(browser, v, w, lang);
  const fails = [];
  try {
    if (HOME.has(v)) {
      const tl = await timelineRules(page, v);
      if (tl.length) fails.push(`timeline: ${tl.slice(0, 3).join(' | ')}`);
    }
    if (sent) {
      const writes = await page.evaluate(() => window.__writes || []);
      if (writes.length) fails.push(`example wrote storage: ${writes.slice(0, 3).join(', ')}`);
      if (sent.length) fails.push(`example sent: ${sent.slice(0, 2).join(' | ')}`);
    }
    const r = await inspect(page);
    if (errors.length) fails.push(`page error: ${errors[0]}`);
    if (r.overflow > 1) fails.push(`overflow ${r.overflow}px`);
    if (r.clipped.length) fails.push(`clipped: ${r.clipped.slice(0, 3).join(' | ')}`);
    if (r.small.length) fails.push(`small targets: ${r.small.slice(0, 4).join(' | ')}`);
    if (r.saffron > 1) fails.push(`saffron marks ${r.saffron}`);
    if (!r.h1) fails.push('no h1');
    if (firstAnims.length) fails.push(`animations at first paint: ${firstAnims.slice(0, 3).join(', ')}`);
    if (lang === 'nl') {
      await page.waitForFunction(() => performance.now() > 4100, null, { timeout: 15000 }).catch(() => {});
      const seen = await page.evaluate(() => window.__englishSeen || []);
      if (seen.length) fails.push(`English place name in nl: ${seen[0]}`);
    }
    const rowsBad = await photoRows(page);
    if (rowsBad.length) fails.push(`photo rows: ${rowsBad.slice(0, 3).join(' | ')}`);
    const blurry = await sharpness(page);
    if (blurry.length) fails.push(`blurry: ${blurry.slice(0, 2).join(' | ')}`);
    const cls = await page.evaluate(() => window.__cls);
    if (cls > 0.05) fails.push(`CLS ${cls.toFixed(3)}`);
    if (lang === 'nl' || w === 390) {
      const a = await axe(page);
      if (a.length) fails.push(`axe: ${a.join(' | ')}`);
    }
    if (fails.length || (SHOTS && (w === 390 || w === 1440))) {
      await page.screenshot({ path: path.join(OUT, `${v}-${lang}-${w}.png`), fullPage: true });
    }
  } finally {
    await ctx.close();
  }
  return { v, w, lang, fails };
}

const browser = await chromium.launch();
const jobs = [];
for (const v of PICK) for (const lang of LANGS) for (const w of WIDTHS) jobs.push([v, w, lang]);
const results = [];
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const [v, w, lang] = jobs[next++];
    try { results.push(await runOne(browser, v, w, lang)); } catch (e) { results.push({ v, w, lang, fails: [`run: ${e.message.split('\n')[0]}`] }); }
  }
}));
await browser.close();
const bad = results.filter((r) => r.fails.length);
for (const r of bad) console.log(`FAIL ${r.v} ${r.lang} ${r.w}: ${r.fails.join('; ')}`);
console.log(`${results.length - bad.length} of ${results.length} cells pass, ${bad.length} fail`);
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 1));
process.exit(bad.length ? 1 : 0);
