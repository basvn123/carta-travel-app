/*
 * Relief (G1, house style 2026-11, DESIGN.md "Background graphics"): the
 * background graphic, drawn only from a place's real peaks, to the right of a
 * hard umber cut with a blaze on top. Text sits only on the flat side, never
 * on the contours; every relief prints at least one real height.
 *
 *   <ReliefBand mountains={dossier.nearby.mountains} seed={place.id} cut="60%">
 *     <h1>Places in Europe</h1>          // sits on the flat side
 *   </ReliefBand>
 *
 * No peaks with a height: the band renders its children on the flat ground
 * only (no contours, no cut), by rule. Decorative: aria-hidden, dropped in
 * forced colours, never animated except one cross-fade when its data changes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { layoutRelief, reliefPeaks } from '../../lib/relief.js';
import { Blaze } from './Blaze.jsx';

export function Relief({ peaks, seed = 'relief', format }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fmt = format || ((n) => n.toLocaleString('en-IE'));
  const key = peaks.map((p) => `${p.name}${p.m}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for peaks; fmt is stable per language
  const drawn = useMemo(() => layoutRelief(peaks, { w: size.w, h: size.h, seed, format: fmt }), [key, size.w, size.h, seed]);
  return (
    <div className="relief" ref={ref} aria-hidden="true" key={key}>
      {drawn && (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" focusable="false">
          {drawn.paths.sh2 && <path className="relief-shade relief-faint" d={drawn.paths.sh2} />}
          {drawn.paths.sh1 && <path className="relief-shade" d={drawn.paths.sh1} />}
          {drawn.paths.lit2 && <path className="relief-lit relief-faint" d={drawn.paths.lit2} />}
          {drawn.paths.lit1 && <path className="relief-lit" d={drawn.paths.lit1} />}
          {drawn.paths.is && <path className="relief-shade relief-index" d={drawn.paths.is} />}
          {drawn.paths.il && <path className="relief-lit relief-index" d={drawn.paths.il} />}
        </svg>
      )}
      {drawn && drawn.spots.map((s) => (
        <span key={s.text} className="relief-spot" style={{ left: `${s.x}px`, top: `${s.y}px` }}>
          <i className="relief-tri" />{s.text}
        </span>
      ))}
    </div>
  );
}

/**
 * A band with a flat side for text and a relief zone after a hard cut.
 * `cut` is where the zone starts (a CSS length or percentage).
 */
export function ReliefBand({ mountains, seed, cut, className = '', format, children }) {
  const peaks = useMemo(() => reliefPeaks(mountains), [mountains]);
  const has = peaks.length > 0;
  const cls = `relief-band${has ? ' has-relief' : ''}${className ? ` ${className}` : ''}`;
  return (
    <div className={cls} style={has && cut ? { '--relief-cut': cut } : undefined}>
      <div className="relief-flat">{children}</div>
      {has && (
        <div className="relief-zone" aria-hidden="true">
          <span className="relief-cut" />
          <Blaze size="sm" className="relief-cut-blaze" />
          <Relief peaks={peaks} seed={seed} format={format} />
        </div>
      )}
    </div>
  );
}
