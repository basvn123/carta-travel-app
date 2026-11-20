import React from 'react';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { localNameOf } from '../../lib/search/localNames.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { useI18n } from '../../i18n/index.jsx';
import { SaveButton } from '../ExploreCards.jsx';
import { PlaceScore, PlaceFigure } from './HouseParts.jsx';
import { WhereLine } from './PlaceRow.jsx';
import { MatchMark } from './MatchMark.jsx';

/**
 * The phone's tap card (G12, map view: decision.md "Phone map view"; round
 * 2, proposal.md section 2): a tap on a pin picks the place and this card
 * sits over the map, above the nav, with the "List of {n}" pill riding above
 * it (the way back never leaves). A 120 px photo with Save on it; the name
 * with its Score, the flag and the region with the match mark, the figure
 * over its basis (the receipt's button). The card opens the place; Close,
 * a swipe down, Escape or a tap on the open map put it away. The places
 * before and after it in the list peek at both edges: a swipe sideways (or
 * the arrow keys) picks the next one and its pin.
 *
 * Its height goes to --xmap-card-h on the root, so the List pill rides on it.
 */
const SWIPE_PX = 48;
const SIDE_PX = 64;

function CardFace({ p, overview, fav, onToggleFav, onOpen, t, ghost = false }) {
  const { lang } = useI18n();
  const name = localNameOf(p.id, lang) || p.city;
  const score = overview?.rating || p.rating;
  return (
    <div className={`xtc-face${ghost ? ' is-ghost' : ''}`} aria-hidden={ghost || undefined}>
      <span className="xtc-media">
        <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xtc-img"
          maxWidth={320} sizes="120px" ratio={[1, 1]} />
        {!ghost && onToggleFav && (
          <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} name={name} tone="photo" className="xtc-save" />
        )}
      </span>
      {!ghost && (
        <div className="xtc-text">
          <p className="xtc-l1">
            <a className="xtc-hit xrow-name" href={`#dest=${encodeURIComponent(p.id)}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onOpen(p.id);
              }}>{name}</a>
            {' '}
            <PlaceScore rating={score} className="xtc-score" />
          </p>
          <p className="xtc-l2">
            <CountryFlag country={p.iso2} size={12} />
            <WhereLine p={p} region={overview?.region || null} t={t} />
            <MatchMark place={p} className="xtc-match" />
          </p>
          <div className="xtc-l3">
            <PlaceFigure place={p} t={t} className="xtc-fig" />
          </div>
        </div>
      )}
    </div>
  );
}

export function MapTapCard({ p, prev = null, next = null, overviewOf, fav, onToggleFav, onOpen, onPick, onClose, t }) {
  const ref = React.useRef(null);
  const drag = React.useRef(null);
  const [d, setD] = React.useState({ x: 0, y: 0 });

  // The map moves its pins clear of the card once it is in place.
  React.useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('carta:map-chrome')), prefersReducedMotion() ? 0 : 260);
    return () => { clearTimeout(id); window.dispatchEvent(new Event('carta:map-chrome')); };
  }, [p.id]);
  // A card that grows (a long name wrapping, its photo arriving) says so
  // too, so the picked pin is kept clear of its final height (judgement-2),
  // and the List pill rides on its top.
  React.useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return undefined;
    let h = el.offsetHeight;
    root.style.setProperty('--xmap-card-h', `${h}px`);
    if (typeof ResizeObserver !== 'function') return () => root.style.removeProperty('--xmap-card-h');
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight === h) return;
      h = el.offsetHeight;
      root.style.setProperty('--xmap-card-h', `${h}px`);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event('carta:map-chrome')));
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); root.style.removeProperty('--xmap-card-h'); };
  }, []);
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') { onClose(); return; }
      // The arrows step through the list while focus is on the card.
      if (!ref.current?.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); onPick(next.id); }
      if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); onPick(prev.id); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPick, prev, next]);

  const onDown = (e) => {
    if (e.target.closest('.xmatch-mark')) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null };
  };
  const onMove = (e) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
    if (!g.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    }
    if (g.axis === 'x') setD({ x: (dx > 0 && !prev) || (dx < 0 && !next) ? dx / 4 : dx, y: 0 });
    else setD({ x: 0, y: Math.max(0, dy) });
  };
  const onUp = (e) => {
    const g = drag.current;
    drag.current = null;
    if (!g || g.id !== e.pointerId || !g.axis) return;
    const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
    setD({ x: 0, y: 0 });
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (g.axis === 'y' && dy > SWIPE_PX) onClose();
    if (g.axis === 'x' && dx < -SIDE_PX && next) onPick(next.id);
    if (g.axis === 'x' && dx > SIDE_PX && prev) onPick(prev.id);
  };

  const moving = d.x || d.y;
  return (
    <div ref={ref} className={`xmap-tapcard${moving ? ' is-dragging' : ''}`} role="group" aria-label={p.city}
      aria-roledescription="carousel"
      style={moving ? { transform: `translate(${d.x}px, ${d.y}px)`, opacity: d.y ? Math.max(0.4, 1 - d.y / 160) : 1 } : undefined}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {prev && <div className="xtc-peek is-prev" aria-hidden="true"><CardFace p={prev} t={t} ghost /></div>}
      <CardFace key={p.id} p={p} overview={overviewOf(p)} fav={fav} onToggleFav={onToggleFav} onOpen={onOpen} t={t} />
      {next && <div className="xtc-peek is-next" aria-hidden="true"><CardFace p={next} t={t} ghost /></div>}
      <Pressable className="xtc-close" aria-label={t('explore.map.close')} onClick={onClose}>
        <HouseIcon.close size={16} />
      </Pressable>
      {prev && (
        <Pressable className="xtc-step is-prev" aria-label={t('explore.map.prev')} onClick={() => onPick(prev.id)}>
          <HouseIcon.prev size={16} />
        </Pressable>
      )}
      {next && (
        <Pressable className="xtc-step is-next" aria-label={t('explore.map.next')} onClick={() => onPick(next.id)}>
          <HouseIcon.next size={16} />
        </Pressable>
      )}
    </div>
  );
}
