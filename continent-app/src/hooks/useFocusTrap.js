/**
 * Focus management for an overlay that claims the screen.
 *
 * A dialog marked `aria-modal="true"` promises a screen reader that nothing
 * outside it is reachable. Binding Escape alone does not keep that promise:
 * the full-screen pages each bound Escape and nothing else, so tabbing out of
 * the back button walked into the still-tabbable results list behind, which
 * the screen reader had already been told was not there.
 *
 * Three things, the same three PlacesFilterSheet has always done:
 *   1. move focus into the overlay when it opens,
 *   2. cycle Tab and Shift+Tab inside it,
 *   3. return focus to whatever opened it on the way out.
 *
 * Escape is bound on the CAPTURE phase and stops propagation, so a nested
 * overlay closes itself and not the page behind it (see the escape-stack rule
 * these pages already follow).
 *
 * Usage:
 *   const panelRef = useRef(null);
 *   const closeRef = useRef(null);
 *   useFocusTrap(panelRef, onClose, { initialFocusRef: closeRef });
 *   <div ref={panelRef} role="dialog" aria-modal="true" aria-label="...">
 *     <button ref={closeRef} ...>
 *
 * `skipEscapeWhen` lets a page keep a child popover's own Escape: return true
 * and this hook leaves the key alone for that press.
 */
import { useEffect } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(panelRef, onClose, options = {}) {
  const { initialFocusRef = null, skipEscapeWhen = null, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return undefined;
    // Whatever had focus before the overlay opened, so it can be handed back.
    const opener = document.activeElement;

    // Move focus in. Prefer the ref the caller named (usually the close
    // button); otherwise the first focusable thing in the panel. Without
    // this the keyboard stays parked behind the overlay.
    //
    // The named ref can exist and still refuse focus: several of these pages
    // render both a phone back arrow and a desktop cross, and CSS hides one
    // of them with `display: none` at any given width. So try the ref, then
    // check whether it actually took focus, and fall back to the first
    // element in the panel that will.
    const focusFirst = () => {
      const named = initialFocusRef?.current;
      named?.focus?.();
      if (named && document.activeElement === named) return;
      for (const el of panelRef.current?.querySelectorAll(FOCUSABLE) || []) {
        el.focus();
        if (document.activeElement === el) return;
      }
    };
    focusFirst();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (skipEscapeWhen && skipEscapeWhen(e)) return;
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Only the two edges need handling; everything between is the
      // browser's own tab order, which is the one we want.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Only restore if the opener is still in the document: the overlay may
      // have been opened from something that has since unmounted.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, enabled]);
}
