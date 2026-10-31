import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Switch } from '../../components/ui/index.js';
import { ArrowLeftIcon, ShareIcon, DownloadIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';

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

/**
 * The recap as a PNG, drawn on a canvas in the browser (T926): no external
 * service sees it. The traveller's own photo (a data URL from a memory) or
 * the deep umber ground, the year's figures as large type, the lines under
 * them, Carta's name small at the foot.
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

  const share = async () => {
    setState('busy');
    try {
      const blob = await drawRecap({ title, cells, lines, photo: on.photo ? recap.photo : null, foot: 'Carta' });
      if (!blob) throw new Error('canvas');
      const file = new File([blob], `carta-${recap.year}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        setState('shared');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState('saved');
    } catch (e) {
      setState(e?.name === 'AbortError' ? '' : 'failed');
    }
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
                <div key={c.key}><dt>{c.label}</dt><dd>{c.value}</dd></div>
              ))}
            </dl>
            {lines.map((l) => <p key={l} className="mt-story-line">{l}</p>)}
            <p className="mt-story-foot">Carta</p>
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
