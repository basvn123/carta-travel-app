/*
 * The typed hint of Ask Carta's empty field (T569, moved here by T570):
 * questions typed out and erased in turn while `on`. A hidden tab or the box
 * out of view pauses it; reduced motion never starts it (carta-design, the
 * Ask Carta exception). Returns the text to draw, '' when off.
 */
import React from 'react';
import { prefersReducedMotion } from '../../lib/motion.js';

// Milliseconds a letter types and erases in, and how long a whole question
// holds before it goes.
const TYPE_MS = 45;
const ERASE_MS = 18;
const HOLD_MS = 1800;

export function useTypedHint(lines, on, boxRef) {
  const [shown, setShown] = React.useState('');
  const key = lines.join('|');
  React.useEffect(() => {
    if (!on || !lines.length || prefersReducedMotion()) { setShown(''); return undefined; }
    let line = 0;
    let n = 0;
    let erasing = false;
    let timer = 0;
    let visible = true;
    const tick = () => {
      if (!visible || document.hidden) { timer = setTimeout(tick, 400); return; }
      const full = lines[line];
      if (!erasing) {
        n += 1;
        setShown(full.slice(0, n));
        if (n >= full.length) { erasing = true; timer = setTimeout(tick, HOLD_MS); return; }
        timer = setTimeout(tick, TYPE_MS);
      } else {
        n -= 1;
        setShown(full.slice(0, Math.max(0, n)));
        if (n <= 0) { erasing = false; line = (line + 1) % lines.length; timer = setTimeout(tick, TYPE_MS * 8); return; }
        timer = setTimeout(tick, ERASE_MS);
      }
    };
    const io = typeof IntersectionObserver === 'function' && boxRef.current
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; })
      : null;
    if (io) io.observe(boxRef.current);
    timer = setTimeout(tick, 600);
    return () => { clearTimeout(timer); io?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the lines
  }, [key, on, boxRef]);
  return shown;
}
