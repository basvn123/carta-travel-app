import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Switch } from '../../components/ui/index.js';
import { ArrowLeftIcon, ShareIcon, DownloadIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { THEMES, pngSize } from './yearCardModel.js';

const W = 1080;
const H = 1350;

/** A token's value, read from the page so the image wears the app's own colours. */
const token = (name) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch { return ''; }
};

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Cover-crop an image into a rectangle. */
function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const sw = w / r;
  const sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Words wrapped to a width at the context's current font. */
function wrapText(ctx, text, max) {
  const out = [];
  let line = '';
  String(text).split(' ').forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > max) { out.push(line); line = w; } else line = next;
  });
  if (line) out.push(line);
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

/** The plate's country paths into a box, as the preview's SVG does (viewBox 70 60 890 940, meet). */
function drawMap(ctx, geo, been, T, x, y, w, h) {
  if (!geo?.countries?.length || w <= 0 || h <= 0) return;
  const sc = Math.min(w / 890, h / 940);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + (w - 890 * sc) / 2 - 70 * sc, y + (h - 940 * sc) / 2 - 60 * sc);
  ctx.scale(sc, sc);
  ctx.strokeStyle = T.bg;
  ctx.lineWidth = 0.7 / sc;
  geo.countries.forEach((c) => {
    if (!c.d) return;
    const p = new Path2D(c.d);
    ctx.fillStyle = been.has(c.cc) ? T.been : T.land;
    ctx.fill(p);
    ctx.stroke(p);
  });
  ctx.restore();
}

/**
 * The year card as a PNG (G12 Phase F): the studio's card at 1080 wide in
 * its format (1080 x 1920, 1350 or 1080), drawn in the card's own 240 unit
 * grid and scaled, so the PNG keeps the preview's proportions. The photo is
 * the traveller's own (a data URL or a same-origin file) so the canvas is
 * never tainted; an example card says so on the image.
 */
export async function drawYearCard({ model, geo, exampleLabel = '' }) {
  const { w, h } = pngSize(model.fmt);
  const s = w / 240;
  const H = h / s;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.scale(s, s);
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const T = Object.fromEntries(Object.entries(THEMES[model.theme]).map(([k, v]) => [k, token(v)]));
  const been = new Set(model.been);
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, 240, H);
  ctx.textBaseline = 'top';
  ctx.fillStyle = T.fg;
  let y = 14;
  // The Viantra mark: a small plate with one stripe, then the name.
  roundRect(ctx, 16, y + 1, 13, 9, 2);
  ctx.fill();
  ctx.fillStyle = T.bg;
  ctx.fillRect(18, y + 4.5, 9, 2);
  ctx.fillStyle = T.fg;
  ctx.globalAlpha = 0.9;
  ctx.font = `800 11px ${font}`;
  ctx.fillText('Viantra', 34, y);
  ctx.globalAlpha = 1;
  if (exampleLabel) {
    ctx.font = `800 10px ${font}`;
    const ew = ctx.measureText(exampleLabel).width + 14;
    roundRect(ctx, 224 - ew, y - 2, ew, 16, 8);
    ctx.fill();
    ctx.fillStyle = T.bg;
    ctx.fillText(exampleLabel, 231 - ew, y + 1.5);
    ctx.fillStyle = T.fg;
  }
  y += 14;
  ctx.font = `800 24px ${font}`;
  wrapText(ctx, model.title, 208).forEach((l) => { ctx.fillText(l, 16, y); y += 25.2; });
  if (model.insight) {
    y += 3;
    ctx.font = `700 12px ${font}`;
    ctx.globalAlpha = 0.82;
    ctx.fillText(model.insight, 16, y);
    ctx.globalAlpha = 1;
    y += 15;
  }
  y += 8;
  // The foot first: its height sets what the middle gets.
  const cells = model.nums.map(([v, l]) => {
    ctx.font = `800 24px ${font}`;
    const a = ctx.measureText(v).width;
    ctx.font = `700 11px ${font}`;
    return { v, l, w: Math.max(a, ctx.measureText(l).width) };
  });
  const rows = [];
  cells.forEach((c) => {
    const row = rows[rows.length - 1];
    if (row && row.x + c.w <= 224) { row.items.push({ ...c, x: row.x }); row.x += c.w + 16; } else rows.push({ x: 16 + c.w + 16, items: [{ ...c, x: 16 }] });
  });
  const numsH = rows.length * 38 + Math.max(0, rows.length - 1) * 4;
  const foot = 10 + numsH + (rows.length && model.months ? 8 : 0) + (model.months ? 20 : 0) + 14;
  const midTop = y;
  const midBot = H - foot;
  const img = model.photo ? await loadImage(model.photo) : null;
  if (img) {
    ctx.save();
    roundRect(ctx, 10, midTop, 220, midBot - midTop, 12);
    ctx.clip();
    drawCover(ctx, img, 10, midTop, 220, midBot - midTop);
    ctx.restore();
    if (model.map) {
      const sz = Math.min(220 * 0.36, midBot - midTop - 16);
      const ix = 10 + 220 - 8 - sz;
      const iy = midBot - 8 - sz;
      ctx.save();
      roundRect(ctx, ix, iy, sz, sz, 10);
      ctx.fillStyle = T.bg;
      ctx.fill();
      ctx.clip();
      drawMap(ctx, geo, been, T, ix, iy, sz, sz);
      ctx.restore();
    }
  } else if (model.map) {
    drawMap(ctx, geo, been, T, 0, midTop, 240, midBot - midTop);
  }
  let fy = midBot + 10;
  ctx.fillStyle = T.fg;
  rows.forEach((r) => {
    r.items.forEach((c) => {
      ctx.font = `800 24px ${font}`;
      ctx.fillText(c.v, c.x, fy);
      ctx.globalAlpha = 0.78;
      ctx.font = `700 11px ${font}`;
      ctx.fillText(c.l, c.x, fy + 26);
      ctx.globalAlpha = 1;
    });
    fy += 42;
  });
  if (rows.length) fy -= 4;
  if (model.months) {
    if (rows.length) fy += 8;
    const mx = Math.max(1, ...model.months);
    const bw = (208 - 22) / 12;
    model.months.forEach((v, i) => {
      const bh = v ? Math.max(4, (20 * v) / mx) : 2;
      ctx.fillStyle = v ? T.mo : T.off;
      roundRect(ctx, 16 + i * (bw + 2), fy + 20 - bh, bw, bh, 1);
      ctx.fill();
    });
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Hands a PNG to the share sheet, or saves it where a file cannot be shared. */
async function sendPng(blob, name, title, share) {
  const file = new File([blob], name, { type: 'image/png' });
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}

/**
 * Draws the studio's year card and shares or downloads it. Resolves to
 * 'shared', 'saved', '' (cancelled) or 'failed'.
 */
export async function exportYearCard({ model, geo, share = false, exampleLabel = '' }) {
  try {
    const blob = await drawYearCard({ model, geo, exampleLabel });
    if (!blob) throw new Error('canvas');
    return await sendPng(blob, `carta-${model.fmt}.png`, model.title, share && !exampleLabel);
  } catch (e) {
    return e?.name === 'AbortError' ? '' : 'failed';
  }
}

/**
 * The recap as a PNG, drawn on a canvas in the browser (T926): no external
 * service sees it. The traveller's own photo (a data URL from a memory) or
 * the deep umber ground, the year's figures as large type, the lines under
 * them, Viantra's name small at the foot.
 */
async function drawRecap({ title, cells, lines, photo, foot }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const deep = token('--home-ground-deep') || token('--text');
  const light = token('--surface');
  ctx.fillStyle = deep;
  ctx.fillRect(0, 0, W, H);
  const img = await loadImage(photo);
  if (img) {
    drawCover(ctx, img, 0, 0, W, H);
    // One even tint of the deep ground over the photo so the words read.
    ctx.fillStyle = deep;
    ctx.globalAlpha = 0.58;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = light;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 76px ${font}`;
  const words = title.split(' ');
  let line = '';
  let y = 200;
  words.forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > W - 160 && line) { ctx.fillText(line, 80, y); line = w; y += 88; } else line = next;
  });
  if (line) ctx.fillText(line, 80, y);
  y += 150;
  cells.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 80 + col * 470;
    const yy = y + row * 220;
    ctx.font = `700 120px ${font}`;
    ctx.fillText(c.value, x, yy);
    ctx.font = `500 40px ${font}`;
    ctx.fillText(c.label, x, yy + 58);
  });
  y += Math.ceil(cells.length / 2) * 220 + 40;
  ctx.font = `500 40px ${font}`;
  lines.forEach((l) => { ctx.fillText(l, 80, y); y += 62; });
  ctx.font = `700 40px ${font}`;
  ctx.fillText(foot, 80, H - 80);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** The title, the figure cells and the lines the image carries. */
function recapParts(recap, on, t) {
  const title = t('mt.recapTitle', { year: recap.year });
  const cells = [
    { key: 'trips', value: String(recap.trips), label: t(recap.trips === 1 ? 'mt.recapTrip1' : 'mt.recapTripN', { n: recap.trips }) },
    on.countries && { key: 'countries', value: String(recap.countries), label: t(recap.countries === 1 ? 'mt.recapCountry1' : 'mt.recapCountryN', { n: recap.countries }) },
    on.nights && { key: 'nights', value: String(recap.nights), label: t('saved.factNights') },
    on.cost && { key: 'cost', value: formatMoney(recap.avgDay), label: t('mt.figDayShort') },
  ].filter(Boolean);
  const lines = [
    on.great && t('mt.recapGreat', { place: recap.cheapestGreat.title, price: formatMoney(recap.cheapestGreat.eur) }),
    on.best && t('mt.recapBest', { place: recap.best.title, n: recap.best.rating }),
  ].filter(Boolean);

  return { title, cells, lines };
}

/**
 * Draws the recap PNG and shares it (or downloads it where the browser
 * cannot share a file). `on` picks the parts; every offered part by default.
 * Resolves to 'shared', 'saved', '' (the traveller cancelled) or 'failed'.
 * Also used by the year card's Delen on the Your Europe tab (G12 Phase E).
 */
export async function shareRecap({ recap, t, on = null }) {
  const all = on || { countries: true, nights: true, cost: Number.isFinite(recap.avgDay), great: !!recap.cheapestGreat, best: !!recap.best, photo: !!recap.photo };
  const { title, cells, lines } = recapParts(recap, all, t);
  try {
    const blob = await drawRecap({ title, cells, lines, photo: all.photo ? recap.photo : null, foot: 'Viantra' });
    if (!blob) throw new Error('canvas');
    const file = new File([blob], `carta-${recap.year}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch (e) {
    return e?.name === 'AbortError' ? '' : 'failed';
  }
}

/**
 * Your year in Europe (T926): a recap screen with a switch for each figure
 * and "Share as an image". Only the traveller's own trips, and only figures
 * the record holds; a part without data is not offered.
 *
 *   recap   { year, trips, countries, nights, avgDay, cheapestGreat, best, photo }
 */
export function YearRecap({ recap, onBack }) {
  const { t } = useI18n();
  const headRef = useRef(null);
  useEffect(() => { headRef.current?.focus(); }, []);
  const offer = [
    ['countries', recap.countries > 0],
    ['nights', recap.nights > 0],
    ['cost', Number.isFinite(recap.avgDay)],
    ['great', !!recap.cheapestGreat],
    ['best', !!recap.best],
    ['photo', !!recap.photo],
  ].filter(([, ok]) => ok).map(([k]) => k);
  const [on, setOn] = useState(() => Object.fromEntries(offer.map((k) => [k, true])));
  const [state, setState] = useState('');

  const { title, cells, lines } = recapParts(recap, on, t);

  const share = async () => {
    setState('busy');
    setState(await shareRecap({ recap, t, on }));
  };

  return (
    <div className="mt-recap">
      <div className="mt-recap-head">
        <Button variant="quiet" size="sm" iconStart={<ArrowLeftIcon size={16} />} onClick={onBack}>{t('mt.backEurope')}</Button>
        <h3 className="mt-recap-h" tabIndex={-1} ref={headRef}>{title}</h3>
      </div>
      <div className="mt-recap-grid">
        <figure className={`mt-story${on.photo && recap.photo ? ' has-photo' : ''}`} aria-label={title}>
          {on.photo && recap.photo && <img src={recap.photo} alt="" className="mt-story-img" />}
          <div className="mt-story-body">
            <p className="mt-story-title">{title}</p>
            <dl className="mt-story-cells">
              {cells.map((c) => (
                <div key={c.key} className="mt-story-cell"><dt>{c.label}</dt><dd>{c.value}</dd></div>
              ))}
            </dl>
            {lines.map((l) => <p key={l} className="mt-story-line">{l}</p>)}
            <p className="mt-story-foot">Viantra</p>
          </div>
        </figure>
        <div className="mt-recap-side">
          <div className="mt-recap-toggles" role="group" aria-label={t('mt.recapShow')}>
            {offer.map((k) => (
              <Switch key={k} label={t(`mt.recapShow_${k}`)} checked={!!on[k]} onChange={(v) => setOn((cur) => ({ ...cur, [k]: v }))} />
            ))}
          </div>
          <div className="mt-recap-acts">
            <Button variant="primary" iconStart={<ShareIcon size={18} />} loading={state === 'busy'} onClick={share}>{t('mt.shareImage')}</Button>
          </div>
          <p className="mt-recap-note" role="status">
            {state === 'saved' && <><DownloadIcon size={14} /> {t('mt.recapSaved')}</>}
            {state === 'shared' && t('mt.recapShared')}
            {state === 'failed' && t('mt.recapFailed')}
            {!state && t('mt.recapPrivate')}
          </p>
        </div>
      </div>
    </div>
  );
}
