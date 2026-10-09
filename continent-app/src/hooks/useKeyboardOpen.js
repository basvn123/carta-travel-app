/**
 * The on-screen keyboard and the bottom nav (T401, row T390-d, DIRECTION.md
 * part 7).
 *
 * On a phone a focused text field raises the keyboard, and a fixed bottom nav
 * either rides up over the field or leaves a strip of chrome between the field
 * and the keys. While a text-entry control has focus on a coarse pointer in the
 * phone layout, this sets `kbd-open` on the root element; 60-v6-shell.css reads
 * it, hides the bar and zeroes `--bottom-nav-h`, so every full-height layout
 * that already follows that variable gives the room back to the field and its
 * submit. The class comes off as soon as focus leaves for something that is not
 * a text field, so the bar is back for the next tap.
 *
 * Nothing here measures the keyboard: browsers report it differently (iOS
 * leaves the layout viewport alone), and a rule that depends on the focused
 * control works the same everywhere.
 *
 * Only a focus the traveller caused counts: a tap on the field (or its label)
 * or a key press in the last 800 ms. A field the page focuses by itself on
 * arrival (the day planner's first step) raises no keyboard on a phone, so it
 * must not take the bar away.
 */
import { useEffect } from 'react';

const NON_TEXT = /^(button|checkbox|radio|range|submit|reset|file|color|image)$/i;

function isTextEntry(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !NON_TEXT.test(el.getAttribute('type') || 'text');
  return false;
}

export function useKeyboardOpen() {
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia('(max-width: 768px) and (pointer: coarse)');
    const set = (on) => root.classList.toggle('kbd-open', on && phone.matches);
    let gesture = { at: -Infinity, target: null, key: false };
    const onPointer = (e) => { gesture = { at: performance.now(), target: e.target, key: false }; };
    const onKey = () => { gesture = { at: performance.now(), target: null, key: true }; };
    const caused = (el) => {
      if (performance.now() - gesture.at > 800) return false;
      if (gesture.key) return true;
      const t = gesture.target;
      return !!t && (t === el || el.contains(t) || t.contains(el));
    };
    const onIn = (e) => { if (isTextEntry(e.target) && caused(e.target)) set(true); };
    const onOut = (e) => { if (!isTextEntry(e.relatedTarget)) set(false); };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    // A rotation to the desktop layout while a field is focused.
    const onMq = () => { if (!phone.matches) root.classList.remove('kbd-open'); };
    phone.addEventListener('change', onMq);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      phone.removeEventListener('change', onMq);
      root.classList.remove('kbd-open');
    };
  }, []);
}
