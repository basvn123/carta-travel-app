import React from 'react';
import { IconButton } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { prefersReducedMotion } from '../../lib/motion.js';
import { PlaceRow } from './PlaceRow.jsx';

/**
 * The phone's tap card (G12, map view: decision.md "Phone map view"): a tap
 * on a pin picks the place and this one-place card sits over the map, above
 * the nav, so the whole map stays in view. It is the list's own row
 * (PlaceRow) at a larger photo: the name and the Score, the country, the
 * figure in the traveller's basis. The row opens the place; the figure
 * opens its receipt; Save saves. A swipe down, Escape or the close control
 * puts it away (the pick clears and the List pill comes back).
 */
const SWIPE_PX = 48;

export function MapTapCard({ p, overview, fav, onToggleFav, onOpen, onClose, t }) {
  const ref = React.useRef(null);
  const drag = React.useRef(null);
  const [dy, setDy] = React.useState(0);

  // The map moves its pins clear of the card once it is in place.
  React.useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('carta:map-chrome')), prefersReducedMotion() ? 0 : 260);
    return () => { clearTimeout(id); window.dispatchEvent(new Event('carta:map-chrome')); };
  }, [p.id]);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onDown = (e) => { drag.current = { id: e.pointerId, y0: e.clientY, moved: false }; };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const y = e.clientY - d.y0;
    if (!d.moved && Math.abs(y) < 6) return;
    if (!d.moved) {
      d.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    }
    setDy(Math.max(0, y));
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    const y = e.clientY - d.y0;
    setDy(0);
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (y > SWIPE_PX) onClose();
  };

  return (
    <div ref={ref} className={`xmap-tapcard${dy ? ' is-dragging' : ''}`} role="group" aria-label={p.city}
      style={dy ? { transform: `translateY(${dy}px)`, opacity: Math.max(0.4, 1 - dy / 160) } : undefined}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <PlaceRow key={p.id} p={p} {...overview} t={t} selected
        fav={fav} onToggleFav={onToggleFav} onOpen={() => onOpen(p.id)} />
      <IconButton className="xmap-tapcard-close" label={t('gs.close')} onClick={onClose}>
        <HouseIcon.close size={16} />
      </IconButton>
    </div>
  );
}
