/**
 * Where focus lands when a full-screen page opens (carta-design "Navigation";
 * T474, row T435-e). One rule for every page that claims the screen (the
 * destination, item, trip, journey and region pages):
 *
 *   opened by pointer or touch, or by a link the app booted on: the page's
 *   heading (its h1, tabindex -1, no ring), so a screen reader starts at the
 *   name and a sighted reader sees no stray ring;
 *   opened from the keyboard: the first control in the page bar (the back
 *   control), so the next key acts.
 *
 * Returns a ref for useFocusTrap's initialFocusRef. The trap still moves
 * focus in, cycles Tab and hands focus back to the opener on close.
 *
 * `readyKey` names the content: a page that renders its bar first and its
 * heading once the data arrives passes something that changes then (the
 * record's id). If the arrival was by pointer and focus is still parked on
 * the bar, it moves to the heading at that moment.
 *
 * Usage:
 *   const pageRef = useRef(null);
 *   const arrivalRef = usePageArrival(pageRef, record?.id);
 *   useFocusTrap(pageRef, onClose, { initialFocusRef: arrivalRef });
 *   <div ref={pageRef} role="dialog" aria-modal="true">
 *     <div className="ipage-bar" data-page-bar>...</div>
 *     <h1>...</h1>
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { lastInputWasKeyboard } from './useFocusTrap.js';

const CONTROL = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function headingOf(page) {
  const h = page?.querySelector('h1');
  if (h && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  return h || null;
}

function firstBarControl(page) {
  const bar = page?.querySelector('[data-page-bar]');
  // A twin hidden at this width (display: none) has no box and cannot take focus.
  return [...(bar?.querySelectorAll(CONTROL) || [])].find((el) => el.getClientRects().length > 0) || null;
}

export function usePageArrival(pageRef, readyKey = null) {
  const arrivalRef = useRef(null);
  // How the page was opened, read once: the trap moves focus a moment later.
  const byKeyboard = useRef(lastInputWasKeyboard());

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const heading = headingOf(page);
    const first = firstBarControl(page);
    arrivalRef.current = byKeyboard.current ? (first || heading) : (heading || first);
  });

  useEffect(() => {
    if (byKeyboard.current || readyKey == null) return;
    const page = pageRef.current;
    const heading = headingOf(page);
    if (!heading) return;
    const active = document.activeElement;
    if (active === heading) return;
    const parked = !active || active === document.body
      || (page.contains(active) && Boolean(active.closest('[data-page-bar]')));
    if (parked) {
      heading.setAttribute('data-focus-quiet', '');
      heading.focus({ preventScroll: true });
    }
  }, [pageRef, readyKey]);

  return arrivalRef;
}
