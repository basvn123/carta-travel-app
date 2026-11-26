import React, { useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { CloseIcon, PlusIcon, ShareIcon } from '../../components/Icons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { FORMATS, ITEMS, THEMES, TITLE_MAX } from './yearCardModel.js';

const BASE = 240;

/**
 * The year card as the traveller sees it (G12 Phase F): the same 240 unit
 * grid the PNG is drawn in (YearRecap.drawYearCard), scaled to `width`, in
 * the chosen style. Colours come from the style's tokens through custom
 * properties, so the map reads in the card's own land and been colours.
 */
export function YearCard({ model, geo, width = 210, example = '' }) {
  const T = THEMES[model.theme];
  const h = Math.round(BASE / FORMATS[model.fmt]);
  const sc = width / BASE;
  const been = new Set(model.been);
  const style = Object.fromEntries(Object.entries(T).map(([k, v]) => [`--yc-${k}`, `var(${v})`]));
  const mx = Math.max(1, ...(model.months || [0]));
  const map = geo ? (
    <svg viewBox="70 60 890 940" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {geo.countries.map((c) => <path key={c.cc} d={c.d} className={been.has(c.cc) ? 'is-been' : ''} />)}
    </svg>
  ) : null;
  return (
    <span className="atlas-ycbox" style={{ width, height: Math.round(h * sc) }}>
      <span className="atlas-yc3" style={{ ...style, width: BASE, height: h, transform: `scale(${sc})` }}>
        <span className="atlas-yc3-h">
          <span className="atlas-yc3-mk"><i aria-hidden="true" />Viantra{example && <em>{example}</em>}</span>
          <b>{model.title}</b>
          {model.insight && <span className="atlas-yc3-ins">{model.insight}</span>}
        </span>
        {model.photo ? (
          <span className="atlas-yc3-photo">
            <img src={model.photo} alt="" />
            {model.map && <span className="atlas-yc3-inset">{map}</span>}
          </span>
        ) : model.map ? <span className="atlas-yc3-map">{map}</span> : <span className="atlas-yc3-gap" />}
        <span className="atlas-yc3-f">
          {model.nums.length > 0 && (
            <span className="atlas-yc3-nums">{model.nums.map(([v, l]) => <span key={l}><b>{v}</b>{l}</span>)}</span>
          )}
          {model.months && (
            <span className="atlas-yc3-mo">
              {model.months.map((v, i) => <i key={i} className={v ? 'is-on' : ''} style={{ height: `${v ? Math.max(4, (20 * v) / mx) : 2}px` }} />)}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/** A row of pressed-state buttons, the reference's seg2. */
function Seg({ label, value, options, onPick }) {
  return (
    <div className="ink-frame is-wide" role="group" aria-label={label}>
      {options.map(([k, l]) => <Pressable key={k} aria-pressed={value === k} onClick={() => onPick(k)}>{l}</Pressable>)}
    </div>
  );
}

/**
 * The studio (Aanpassen, or a tap on the preview): title, format, style,
 * photo, what is on it, the year, Download and Delen. The preview follows
 * every change live; the sheet itself stays mounted, so it keeps its scroll
 * and never plays its entrance again. An upload is read with FileReader
 * and kept in memory on this device only; it is never sent anywhere.
 *   cfg, onCfg(patch)   the studio's choices
 *   photos   the traveller's own trip photos (data URLs or same-origin files)
 */
export function YearStudio({
  model, geo, cfg, onCfg, years = [], year, hasMoney = false, photos = [], upload = '', onUpload,
  onClose, onDownload, onShare, busy = '', note = '', example = '',
}) {
  const { t } = useI18n();
  const fileRef = useRef(null);
  const [wide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1100px)').matches);
  const on = new Set(cfg.items);
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => { onUpload?.(String(r.result)); onCfg({ photo: String(r.result) }); };
    r.readAsDataURL(f);
    e.target.value = '';
  };
  const thumbs = [...photos, ...(upload && !photos.includes(upload) ? [upload] : [])];
  return (
    <SheetShell title={t('mt.yearCard')} onClose={onClose} labelId="mt-studio-title" className="atlas-studio-sheet">
      <div className="atlas-studio-grid">
        <div className="atlas-studio-prev">
          <YearCard model={model} geo={geo} width={wide ? 300 : 200} example={example} />
        </div>
        <div className="atlas-studio">
          <label className="atlas-studio-f">
            {t('mt.stTitle')}
            <input
              type="text"
              value={cfg.title == null ? model.title : cfg.title}
              maxLength={TITLE_MAX}
              onChange={(e) => onCfg({ title: e.target.value })}
            />
          </label>
          <div className="atlas-studio-f">
            {t('mt.stFormat')}
            <Seg label={t('mt.stFormat')} value={cfg.fmt} onPick={(fmt) => onCfg({ fmt })}
              options={[['story', t('mt.fmtStory')], ['post', t('mt.fmtPost')], ['square', t('mt.fmtSquare')]]} />
          </div>
          <div className="atlas-studio-f">
            {t('mt.stStyle')}
            <div className="atlas-swatches" role="group" aria-label={t('mt.stStyle')}>
              {Object.keys(THEMES).map((k) => (
                <Pressable key={k} className="atlas-sw" aria-pressed={cfg.theme === k} onClick={() => onCfg({ theme: k })}>
                  <i style={{ background: `var(${THEMES[k].bg})` }}><b style={{ background: `var(${THEMES[k].been})` }} /></i>
                  {t(`mt.th${k[0].toUpperCase()}${k.slice(1)}`)}
                </Pressable>
              ))}
            </div>
          </div>
          <div className="atlas-studio-f">
            {t('mt.stPhoto')}
            <div className="atlas-thumbs" role="group" aria-label={t('mt.stPhoto')}>
              <Pressable aria-pressed={!cfg.photo} aria-label={t('mt.stNoPhoto')} onClick={() => onCfg({ photo: '' })}><CloseIcon size={18} /></Pressable>
              {thumbs.map((src, i) => (
                <Pressable key={src.slice(-40) + i} aria-pressed={cfg.photo === src} onClick={() => onCfg({ photo: src })}>
                  <img src={src} alt={src === upload ? t('mt.stYourPhoto') : t('mt.stTripPhoto', { n: i + 1 })} />
                </Pressable>
              ))}
              <Pressable className="atlas-upl" aria-label={t('mt.stUpload')} onClick={() => fileRef.current?.click()}><PlusIcon size={18} /></Pressable>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} data-testid="yc-file" />
            </div>
          </div>
          <div className="atlas-studio-f">
            {t('mt.stShows')}
            <div className="atlas-studio-chips" role="group" aria-label={t('mt.stShows')}>
              {ITEMS.map((k) => {
                const dis = k === 'money' && !hasMoney;
                const isOn = on.has(k) && !dis;
                return (
                  <Pressable
                    key={k}
                    className="atlas-chip"
                    aria-pressed={isOn}
                    disabled={dis}
                    onClick={() => onCfg({ items: isOn ? cfg.items.filter((x) => x !== k) : [...cfg.items, k] })}
                  >
                    {t(`mt.it_${k}`)}
                  </Pressable>
                );
              })}
            </div>
          </div>
          {years.length > 1 && (
            <div className="atlas-studio-f">
              {t('mt.stYear')}
              <Seg label={t('mt.stYear')} value={year} onPick={(y) => onCfg({ year: y })} options={years.map((y) => [y, String(y)])} />
            </div>
          )}
          <div className="atlas-two">
            <Pressable className="atlas-btn" onClick={onDownload} aria-busy={busy === 'download'}>{t('mt.download')}</Pressable>
            {!example && (
              <Pressable className="atlas-btn is-primary" onClick={onShare} aria-busy={busy === 'share'}><ShareIcon size={16} />{t('mt.share')}</Pressable>
            )}
          </div>
          <p className="atlas-studio-note" role="status">{note || (cfg.photo ? t('mt.stPrivate') : '')}</p>
        </div>
      </div>
    </SheetShell>
  );
}
