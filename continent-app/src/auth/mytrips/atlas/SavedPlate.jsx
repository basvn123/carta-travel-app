import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/index.jsx';
import { PlusIcon } from '../../../components/Icons.jsx';
import { HeroImage } from '../../../components/HeroImage.jsx';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { formatMoney } from '../../../lib/money.js';
import { countryName } from '../../../lib/countryName.js';
import { AtlasPlate } from './AtlasPlate.jsx';
import { NAME_OF } from './plateData.js';
import { project } from './project.js';

const MAX_Z = 8;
// From these zooms a place with a photo shows as a photo pin, then a big
// one, then with its name (the prototype's mapHTML, run 2026-11-21-my-trips-tab).
const PHOTO_Z = 2;
const BIG_Z = 3.4;
const NAME_Z = 2.6;
const pct = (vb, x, y) => ({ left: `${(((x - vb.x) / vb.w) * 100).toFixed(2)}%`, top: `${(((y - vb.y) / vb.h) * 100).toFixed(2)}%` });
const NO_TRIPS = { routes: [], stops: [], corners: [], labels: [], here: null };

function MinusIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

/**
 * The Saved tab's map (G12, owner fixes round 4): the Your Europe plate in
 * Explore's colours (been on the umber year ramp, the next country hatched)
 * with the saved places on it, so Saved and Your Europe read as one atlas.
 * No trip routes here: the pins are the subject.
 *
 * Zoomed out a count pill names each country with two or more saves; a tap
 * on it or on the country filters the list to it. Zoom (the +/- control,
 * the wheel, a double click or tap, a pinch) redraws the plate's own
 * viewBox up to 8x, so hairlines and labels keep their screen size; drag
 * pans once zoomed. From zoom 2 the places with a photo show as photo pins
 * (40 px, 54 px from 3.4) with their name from 2.6. The list stays the main
 * path for the keyboard; the pins are a pointer shortcut to a row.
 *
 *   points   [{ lat, lon, name, img, key, cc }]
 *   cc       the country filter (ISO2) or ''
 *   onCountry(iso or '')   a country or pill tap
 *   onPin(point)           a pin tap
 */
export function SavedPlate({ geo, europe, points, cc = '', hot = '', onCountry, onPin }) {
  const { t } = useI18n();
  const box = useRef(null);
  const vbRef = useRef(null);
  const [mz, setMz] = useState({ z: 1, cx: null, cy: null });
  const gesture = useRef({ ptrs: new Map(), drag: null, pinch: null, moved: false, lastTap: 0, lastType: '' });

  const zoomBy = useCallback((f, mx, my) => {
    const vb = vbRef.current;
    const el = box.current;
    if (!vb || !el) return;
    const r = el.getBoundingClientRect();
    setMz((s) => {
      const z1 = Math.min(MAX_Z, Math.max(1, s.z * f));
      if (z1 <= 1.01) return { z: 1, cx: null, cy: null };
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const px = mx == null ? cx : vb.x + ((mx - r.left) / r.width) * vb.w;
      const py = my == null ? cy : vb.y + ((my - r.top) / r.height) * vb.h;
      return { z: z1, cx: px - (px - cx) * (s.z / z1), cy: py - (py - cy) * (s.z / z1) };
    });
  }, []);

  // The wheel zooms the plate, not the page: it needs a listener that may
  // prevent the default, which React's onWheel cannot.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const plateEl = () => box.current?.querySelector('.atlas-plate');
  const dist = (m) => { const [a, b] = [...m.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    const g = gesture.current;
    g.lastType = e.pointerType;
    g.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.moved = false;
    if (g.ptrs.size === 2) {
      g.drag = null;
      const p = plateEl();
      if (p) p.style.transform = '';
      g.pinch = { d: dist(g.ptrs) };
    } else if (mz.z > 1) g.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g.ptrs.has(e.pointerId)) return;
    g.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pinch && g.ptrs.size === 2) {
      const d = dist(g.ptrs);
      if (g.pinch.d > 0 && Math.abs(d / g.pinch.d - 1) > 0.03) {
        const [a, b] = [...g.ptrs.values()];
        zoomBy(d / g.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        g.pinch.d = d;
        g.moved = true;
      }
      return;
    }
    if (!g.drag) return;
    const dx = e.clientX - g.drag.x;
    const dy = e.clientY - g.drag.y;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      g.moved = true;
      box.current?.setPointerCapture?.(e.pointerId);
      box.current?.classList.add('is-dragging');
    }
    const p = plateEl();
    if (g.moved && p) p.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onPointerUp = (e) => {
    const g = gesture.current;
    g.ptrs.delete(e.pointerId);
    if (g.ptrs.size < 2) g.pinch = null;
    const d = g.drag;
    if (d && d.id === e.pointerId) {
      g.drag = null;
      box.current?.classList.remove('is-dragging');
      const p = plateEl();
      if (p) p.style.transform = '';
      const vb = vbRef.current;
      const r = box.current?.getBoundingClientRect();
      if (g.moved && vb && r?.width) {
        const dx = ((e.clientX - d.x) / r.width) * vb.w;
        const dy = ((e.clientY - d.y) / r.height) * vb.h;
        setMz((s) => ({ ...s, cx: (s.cx ?? vb.x + vb.w / 2) - dx, cy: (s.cy ?? vb.y + vb.h / 2) - dy }));
      }
    }
    // A double tap on touch zooms in (a phone does not always send dblclick).
    if (e.pointerType === 'touch' && !g.moved && !e.target.closest('button')) {
      const now = e.timeStamp;
      if (now - g.lastTap < 320) { zoomBy(1.8, e.clientX, e.clientY); g.lastTap = 0; } else g.lastTap = now;
    }
  };
  // A drag or a pinch ends in a click on whatever is under it: not a pick.
  const onClickCapture = (e) => {
    if (gesture.current.moved) { e.stopPropagation(); e.preventDefault(); gesture.current.moved = false; }
  };
  const onDoubleClick = (e) => {
    if (gesture.current.lastType === 'touch' || e.target.closest('button')) return;
    zoomBy(1.8, e.clientX, e.clientY);
  };

  const pins = useMemo(() => {
    const seen = {};
    return points.map((p) => {
      const at = project(p.lat, p.lon);
      if (!at) return null;
      const c = String(p.cc || '').toUpperCase();
      const j = (seen[c] = (seen[c] ?? -1) + 1);
      return { ...p, cc: c, x: at[0], y: at[1], j };
    }).filter(Boolean);
  }, [points]);
  const per = useMemo(() => {
    const out = {};
    pins.forEach((p) => { if (p.cc) out[p.cc] = (out[p.cc] || 0) + 1; });
    return out;
  }, [pins]);
  const centre = useMemo(() => Object.fromEntries((geo?.countries || []).map((c) => [c.cc, c])), [geo]);
  const pick = cc.toUpperCase();
  const name = (c) => countryName(c, NAME_OF[c] || c);
  const layer = useMemo(() => ({ ...europe, ...NO_TRIPS, whole: true }), [europe]);

  const overlay = (vb, k) => {
    vbRef.current = vb;
    const photos = mz.z >= PHOTO_Z;
    const r = box.current?.getBoundingClientRect();
    const wpx = r?.width || vb.w / k;
    const hpx = r?.height || vb.h / k;
    // Places in one spot fan out a few pixels, as in the prototype.
    const off = (p) => [((p.j % 5) - 2) * 3 * k, ((Math.floor(p.j / 5) % 3) - 1) * 3 * k];
    const placed = [];
    const pills = photos ? [] : Object.entries(per).filter(([c, n]) => n >= 2 && centre[c]).sort((a, b) => b[1] - a[1]).filter(([c]) => {
      const sx = (centre[c].x - vb.x) / k;
      const sy = (centre[c].y - vb.y) / k;
      if (sx < 24 || sy < 14 || sx > wpx - 24 || sy > hpx * 0.84) return false;
      if (placed.some((q) => Math.abs(q[0] - sx) < 72 && Math.abs(q[1] - sy) < 30)) return false;
      placed.push([sx, sy]);
      return true;
    });
    return (
      <div className="atlas-pins">
        {pins.map((p) => {
          const [jx, jy] = off(p);
          const dim = pick && p.cc !== pick ? ' is-dim' : '';
          const at = pct(vb, p.x + jx, p.y + jy);
          if (photos && p.img && !dim) {
            return (
              <React.Fragment key={p.key}>
                <span className={`atlas-pin-photo${mz.z >= BIG_Z ? ' is-big' : ''}`} style={at} onClick={() => onPin?.(p)} aria-hidden="true">
                  <HeroImage url={p.img} city={p.name} iso2={p.cc} className="atlas-pin-img" maxWidth={120} ratio={[1, 1]} sizes="54px" />
                </span>
                {mz.z >= NAME_Z && <span className="atlas-pin-cap" style={at} aria-hidden="true">{p.name}</span>}
              </React.Fragment>
            );
          }
          return <span key={p.key} className={`atlas-pin-dot${dim}`} style={at} onClick={() => onPin?.(p)} aria-hidden="true" />;
        })}
        {pins.filter((p) => p.key === hot).map((p) => (
          <span key={`hot-${p.key}`} className="atlas-pinplate" style={pct(vb, p.x, p.y)} aria-hidden="true">
            {p.img && <HeroImage url={p.img} city={p.name} iso2={p.cc} className="atlas-pinplate-img" maxWidth={120} ratio={[1, 1]} sizes="28px" />}
            <b>{p.name}</b>
            <span>{Number.isFinite(p.fig) ? formatMoney(p.fig) : t('saved.factNoPrice')}</span>
          </span>
        ))}
        {pills.map(([c, n]) => (
          <Pressable
            key={c}
            haptic="tick"
            className="atlas-pill"
            style={pct(vb, centre[c].x, centre[c].y)}
            aria-pressed={pick === c}
            aria-label={t('mt.mapSavedPill', { country: name(c), n })}
            onClick={(e) => { e.stopPropagation(); onCountry?.(pick === c ? '' : c); }}
          >
            {name(c)} <b>{n}</b>
          </Pressable>
        ))}
      </div>
    );
  };

  const nCountries = Object.keys(per).length;
  // The countries that hold a saved place are hatched: hatched is "want", filled is "been".
  const wish = useMemo(() => new Set(Object.keys(per)), [per]);
  return (
    <div
      ref={box}
      className={`atlas-zoom${mz.z > 1 ? ' is-zoomed' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onDoubleClick={onDoubleClick}
    >
      <AtlasPlate
        geo={geo}
        layer={layer}
        been={europe?.been}
        next={europe?.next}
        label={t('mt.mapSaved', { n: pins.length, c: nCountries })}
        picked={pick}
        onPick={(c) => onCountry?.(c || '')}
        zoom={mz}
        overlay={overlay}
        wish={wish}
      >
        {/* G12 atlas: the count is counted from the list, places and their countries. */}
        <span className="atlas-floatchip is-wish"><b>{t('mt.wishCount', { p: pins.length, c: nCountries })}</b></span>
      </AtlasPlate>
      <div className="atlas-zoomctl">
        <Pressable haptic="tick" aria-label={t('mt.zoomIn')} disabled={mz.z >= MAX_Z} onClick={() => zoomBy(1.7)}><PlusIcon size={20} /></Pressable>
        <Pressable haptic="tick" aria-label={t('mt.zoomOut')} disabled={mz.z <= 1} onClick={() => zoomBy(1 / 1.7)}><MinusIcon size={20} /></Pressable>
      </div>
    </div>
  );
}
