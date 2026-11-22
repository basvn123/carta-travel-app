/**
 * Uitgaven and Reiskas proof (G15). Opens My trips with ?savedmock=spend
 * (a trip in Portugal on day 4 of 7 with Sam, Jo and Lien), taps the quiet
 * "Uitgaven" row on Today and walks every state of the page at each width:
 *
 *   page-today, page-kas, add, add-each, confirm, detail, all, nudge,
 *   listen (a scripted recogniser: "vijftien euro lunch met Sam"), which,
 *   scan (a fake camera), receipt (Tesseract on the device, at 390: first
 *   with the model missing, a 404 as in production until the owner uploads
 *   it, which must end in "type the amount" with Verder within 45 s and
 *   lead to the add sheet; then, with --ocr, the model served and the
 *   total 9,60 read)
 *
 * In every state: no horizontal overflow, no page errors, every control in
 * the page at least 44 x 44 px, no clipped label (a button or figure whose
 * text is wider than its box), axe serious and critical 0 inside the page.
 * Once per width: the payer dot and its text share a centre line (within
 * 1.5 px), the page is not re-mounted and its slide-in does not replay when
 * a sheet opens or its body changes (add to confirm), opening a sheet shifts
 * nothing (CLS 0), and with reduced motion no animation runs.
 *
 * Needs a build with VITE_E2E_SEAMS=1 served with the data:
 *   node scripts/verify_spend.mjs --port 5852 [--widths 360,390] [--lang nl-NL]
 *     [--ocr <dir with eng.traineddata.gz>] [--out <dir>] [--shots]
 * Exit code 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5852');
const WIDTHS = arg('widths', '360,390,820,1180,1440').split(',').map(Number);
const LANG = arg('lang', 'nl-NL');
const OCR = arg('ocr', '');
const OUT = path.resolve(arg('out', 'verify-spend'));
const SHOTS = process.argv.includes('--shots');
fs.mkdirSync(OUT, { recursive: true });

const URL_ = `http://127.0.0.1:${PORT}/?tab=trips&savedmock=spend`;

// A recogniser that "hears" one sentence, word by word, then ends.
const FAKE_SPEECH = `(() => {
  class FakeRec {
    constructor() { this.lang = 'nl-NL'; }
    start() {
      const words = (window.__say || 'vijftien euro lunch met Sam').split(' ');
      let i = 0;
      const tick = () => {
        i += 1;
        const text = words.slice(0, i).join(' ');
        this.onresult && this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: i === words.length })] });
        if (i < words.length) setTimeout(tick, 60); else setTimeout(() => this.onend && this.onend(), 60);
      };
      setTimeout(tick, 60);
    }
    stop() { this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
})();`;

async function open(browser, w, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 700 ? 844 : 900 }, locale: LANG, hasTouch: w < 700, ...opts,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.savedTripsTab', 'trips');
    localStorage.setItem('carta.spend.speechNotice.v1', 'true');
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  });
  await page.addInitScript(FAKE_SPEECH);
  // The OCR model: missing (404, today's production state) unless a step
  // turns it on and --ocr names a folder that holds it.
  const model = { on: false };
  await ctx.route('https://data.carta-europetravel.com/ocr/**', (route) => {
    const f = OCR ? path.join(OCR, path.basename(new URL(route.request().url()).pathname)) : '';
    return model.on && f && fs.existsSync(f)
      ? route.fulfill({ body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } })
      : route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.locator('.mt-spend-door').waitFor({ timeout: 30000 });
  return { ctx, page, errors, model };
}

const settle = (page, ms = 520) => page.waitForTimeout(ms);

/** Overflow, small targets and clipped labels inside the page. */
const layout = (page) => page.evaluate(() => {
  const out = [];
  const d = document.documentElement;
  const panel = document.querySelector('.sp-panel');
  if (!panel) return ['no page'];
  if (d.scrollWidth > d.clientWidth + 1) out.push(`document overflows by ${d.scrollWidth - d.clientWidth}px`);
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]'); };
  for (const el of panel.querySelectorAll('.sp-scroll, .sp-sheet, .sp-chips')) {
    if (!visible(el)) continue;
    const allowed = el.classList.contains('sp-chips');
    if (!allowed && el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} overflows by ${el.scrollWidth - el.clientWidth}px`);
  }
  for (const el of panel.querySelectorAll('button, a[href], input:not([type=file]), textarea, label.sp-upl, label.sp-auto')) {
    if (!visible(el)) continue;
    if (el.matches('.sp-upl input, .sp-auto input')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.push(`target ${Math.round(r.width)}x${Math.round(r.height)}: ${(el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 40)}`);
  }
  const clipSel = 'button, a.sp-way, .sp-sech > *, .sp-ptxt, .sp-tr-amt, .sp-bv, .sp-row-am, .sp-amtc, .sp-csum-big, .sp-cline b, .sp-tabs button, .sp-ttl h1';
  for (const el of panel.querySelectorAll(clipSel)) {
    if (!visible(el) || el.closest('.sp-chips')) continue;
    if (el.scrollWidth > el.clientWidth + 1) out.push(`clipped: ${(el.textContent || '').trim().slice(0, 40)}`);
  }
  for (const el of panel.querySelectorAll('.sp-chips button')) {
    if (visible(el) && el.scrollWidth > el.clientWidth + 1) out.push(`chip clipped: ${(el.textContent || '').trim().slice(0, 40)}`);
  }
  return out;
});

async function axe(page) {
  const r = await new AxeBuilder({ page }).include('.sp-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')
    .map((x) => `${x.id}(${x.nodes.length}): ${x.nodes[0]?.target?.join(' ')}`);
}

/** The payer dot's centre against its text's glyph box centre. */
const alignment = (page) => page.evaluate(() => {
  const out = [];
  for (const by of document.querySelectorAll('.sp-scroll .sp-row-by')) {
    const dot = by.querySelector('.sp-face.is-dot');
    const span = by.querySelector(':scope > span:last-child');
    if (!dot || !span) continue;
    const text = [...span.childNodes].find((n) => n.nodeType === 1 && n.tagName === 'B')?.firstChild;
    if (!text) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    const t = range.getBoundingClientRect();
    const d = dot.getBoundingClientRect();
    // The glyph box of Overpass runs from the ascent to the descent; the
    // x-height centre of capitals and lower case sits about 0.06 em above
    // the box centre, which the house style aligns to.
    const fs = parseFloat(getComputedStyle(span).fontSize);
    const textMid = (t.top + t.bottom) / 2 - 0.06 * fs;
    const diff = Math.abs((d.top + d.bottom) / 2 - textMid);
    if (diff > 1.5) out.push(`payer dot off by ${diff.toFixed(1)}px`);
  }
  return out;
});

async function shot(page, name, w) {
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `spend-${name}-${w}.png`) });
}

async function check(page, name, w, rows, errors) {
  await settle(page);
  const fail = [...await layout(page), ...await axe(page), ...errors.splice(0)];
  rows.push({ w, state: name, ok: !fail.length, fail });
  if (fail.length || (SHOTS && (w === 390 || w === 1440))) await shot(page, name, w);
}

const closeSheet = async (page) => { await page.keyboard.press('Escape'); await settle(page); };

async function runWidth(browser, w) {
  const rows = [];
  const { ctx, page, errors, model } = await open(browser, w, {
    permissions: ['camera'],
  });
  await page.locator('.mt-spend-door').click();
  await page.locator('.sp-page').waitFor();
  await check(page, 'page-today', w, rows, errors);
  const align = await alignment(page);
  rows.push({ w, state: 'payer-dot-alignment', ok: !align.length, fail: align });

  // No re-mount, no replayed slide-in, no shift when a sheet opens.
  await page.evaluate(() => { document.querySelector('.sp-page').__mark = 1; window.__cls = 0; });
  await page.locator('.sp-addbtn').click();
  await settle(page);
  await page.evaluate(() => { document.querySelector('.sp-sheet').__mark = 1; });
  const remount = await page.evaluate(() => {
    const out = [];
    if (document.querySelector('.sp-page').__mark !== 1) out.push('page re-mounted on sheet open');
    const running = document.querySelector('.sp-panel').getAnimations().filter((a) => a.playState === 'running');
    if (running.length) out.push('page slide-in replayed');
    if (window.__cls > 0.001) out.push(`CLS ${window.__cls.toFixed(3)} on sheet open`);
    return out;
  });
  await check(page, 'add', w, rows, errors);
  for (const k of ['1', '2', 'dec', '5']) {
    const sel = k === 'dec' ? '.sp-keys button:nth-child(10)' : `.sp-keys button:text-is("${k}")`;
    await page.locator(sel).dispatchEvent('pointerdown');
  }
  await page.locator('.sp-voor button').nth(1).click();
  await check(page, 'add-each', w, rows, errors);
  await page.locator('.sp-voor button').nth(0).click();
  await page.locator('.sp-go').click();
  await settle(page);
  remount.push(...await page.evaluate(() => (document.querySelector('.sp-sheet')?.__mark === 1 ? [] : ['sheet re-mounted from add to confirm'])));
  rows.push({ w, state: 'no-remount', ok: !remount.length, fail: remount });
  await check(page, 'confirm', w, rows, errors);
  await page.locator('.sp-sheet .sp-go').click();
  await settle(page);
  const saved = await page.locator('.sp-toast').count();
  rows.push({ w, state: 'save-toast', ok: saved === 1, fail: saved === 1 ? [] : ['no undo toast after save'] });

  await page.locator('.sp-scroll .sp-row').nth(2).click();
  await check(page, 'detail', w, rows, errors);
  await closeSheet(page);

  await page.locator('.sp-tabs button').nth(1).click();
  await check(page, 'page-kas', w, rows, errors);
  await page.locator('.sp-seeall').click();
  await check(page, 'all', w, rows, errors);
  await closeSheet(page);
  const por = page.locator('.sp-tr .sp-act').first();
  if (await por.count()) {
    await por.click();
    await check(page, 'nudge', w, rows, errors);
    await closeSheet(page);
  }

  await page.locator('.sp-side').first().click();
  await page.waitForTimeout(150);
  // The one-time notice (a new device): read, then Start inside the tap.
  if (await page.locator('.sp-notice').count()) {
    await check(page, 'speech-notice', w, rows, errors);
    await page.locator('.sp-listen .sp-go').click();
    await page.waitForTimeout(150);
  }
  await check(page, 'listen', w, rows, errors);
  await page.locator('.sp-which').waitFor({ timeout: 4000 }).catch(() => {});
  await check(page, 'which', w, rows, errors);
  await closeSheet(page);

  await page.locator('.sp-side').last().click();
  await check(page, 'scan', w, rows, errors);
  // The receipt read finishes, one way or the other: no sheet may stay on
  // "reading" (judge round 1 found it hanging on a missing model).
  const readReceipt = async (limitMs) => {
    const t0 = Date.now();
    await page.locator('.sp-upl input[type=file]').first().setInputFiles(path.resolve('scripts/fixtures/receipt-sample.png'));
    const done = await page.waitForFunction(() => {
      const sh = document.querySelector('.sp-sheet[data-kind="receipt"]');
      return !!sh && !sh.querySelector('.sp-meter') && !!sh.querySelector('.sp-go');
    }, null, { timeout: limitMs }).then(() => true, () => false);
    const read = await page.evaluate(() => ({
      paper: !!document.querySelector('.sp-paper'),
      picked: document.querySelector('.sp-ln.is-on .sp-amtc')?.textContent || '',
      next: document.querySelector('.sp-sheet[data-kind="receipt"] .sp-go')?.textContent || '',
    }));
    return { done, read, ms: Date.now() - t0 };
  };
  if (w === 390) {
    // 1. The model missing: the sheet says to type it, with Verder, in time.
    const miss = await readReceipt(45000);
    const missOk = miss.done && !miss.read.paper && !!miss.read.next;
    rows.push({ w, state: 'receipt-model-missing', ok: missOk, fail: missOk ? [] : [`no honest failure in ${miss.ms} ms: ${JSON.stringify(miss.read)}`] });
    await check(page, 'receipt-failed', w, rows, errors);
    await page.locator('.sp-sheet[data-kind="receipt"] .sp-go').click();
    await settle(page);
    const toAdd = await page.locator('.sp-sheet[data-kind="add"]').count();
    rows.push({ w, state: 'receipt-failed-to-add', ok: toAdd === 1, fail: toAdd === 1 ? [] : ['Verder did not open the add sheet'] });
    await closeSheet(page);
    // 2. The model present (--ocr): the lines and the total 9,60.
    if (OCR) {
      model.on = true;
      await page.locator('.sp-side').last().click();
      await settle(page);
      const hit = await readReceipt(120000);
      const hitOk = hit.done && hit.read.paper && /9[,.]60/.test(hit.read.picked);
      rows.push({ w, state: 'receipt-read', ok: hitOk, fail: hitOk ? [] : [`receipt: ${JSON.stringify(hit.read)}`] });
      await check(page, 'receipt', w, rows, errors);
      await closeSheet(page);
    }
  } else {
    await closeSheet(page);
  }
  await ctx.close();

  // Reduced motion: nothing runs once the page and a sheet are open.
  const rm = await open(browser, w, { reducedMotion: 'reduce' });
  await rm.page.locator('.mt-spend-door').click();
  await rm.page.locator('.sp-addbtn').click();
  await rm.page.waitForTimeout(100);
  const anim = await rm.page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.sp-root') && !a.effect.target.closest('.sp-caret'))
    .map((a) => a.effect.target.className));
  rows.push({ w, state: 'reduced-motion', ok: !anim.length, fail: anim.map((c) => `animation on ${c}`) });
  await rm.ctx.close();
  return rows;
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const all = [];
for (const w of WIDTHS) all.push(...await runWidth(browser, w));
await browser.close();
const bad = all.filter((r) => !r.ok);
for (const r of all) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${String(r.w).padStart(4)} ${r.state}${r.ok ? '' : `: ${r.fail.join('; ')}`}`);
fs.writeFileSync(path.join(OUT, 'verify-spend.json'), JSON.stringify(all, null, 2));
console.log(`\n${all.length} cells, ${bad.length} fail`);
process.exit(bad.length ? 1 : 0);
