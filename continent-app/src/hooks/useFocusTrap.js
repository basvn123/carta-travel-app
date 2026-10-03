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
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// The edges of the cycle must be things Tab can actually land on. A control
// inside a closed fold, a phone-only twin hidden at desktop width, or a
// `visibility: hidden` drawer matches the selector but refuses focus, and
// treating one as the last item meant Tab on the real last control fell out
// of the panel into the page behind it (T190 found this on the destination
// page, where the last match sat in a closed fold).
const tabbable = (root) => [...(root?.querySelectorAll(FOCUSABLE) || [])].filter((el) => (
  el.tabIndex >= 0
  && el.getClientRects().length > 0
  && getComputedStyle(el).visibility !== 'hidden'
  && !el.closest('[inert]')
  && !(el.tagName !== 'SUMMARY' && el.closest('details:not([open])'))
));

// Open traps, oldest first. Only the newest one may pull dropped focus back,
// so a nested overlay wins over the page it opened from.
const openTraps = [];

export function useFocusTrap(panelRef, onClose, options = {}) {
  const { initialFocusRef = null, skipEscapeWhen = null, enabled = true } = options;
  // Read at keypress time, so a caller's inline predicate never re-runs the
  // trap (which would pull focus back to the first control on every render).
  const skipRef = useRef(skipEscapeWhen);
  skipRef.current = skipEscapeWhen;
  // Same for onClose. Callers pass inline arrows (App hands DestinationPage
  // `() => setSelectedId(null)`), and with onClose in the effect's
  // dependencies every App render re-ran the trap: focus snapped back to the
  // close button mid-walk, and the trap moved to the top of the stack below.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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
      for (const el of tabbable(panelRef.current)) {
        el.focus();
        if (document.activeElement === el) return;
      }
    };
    focusFirst();

    const token = {};
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Every trap listens on the document in the capture phase, oldest
        // first, so without this one press closed the nested overlay AND
        // the page it was opened from.
        if (openTraps[openTraps.length - 1] !== token) return;
        if (skipRef.current && skipRef.current(e)) return;
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      const items = tabbable(panelRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Focus dropped to the body (the control that held it unmounted, or a
      // click landed on bare background) comes back in at the edge Tab
      // points to. Focus inside some other surface is left alone: that is a
      // nested overlay with its own trap.
      const active = document.activeElement;
      if (!active || active === document.body) {
        if (openTraps[openTraps.length - 1] !== token) return;
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
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

    openTraps.push(token);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      openTraps.splice(openTraps.indexOf(token), 1);
      // Only restore if the opener is still in the document: the overlay may
      // have been opened from something that has since unmounted.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
    // panelRef and initialFocusRef are ref objects, stable for the overlay's
    // life; onClose is read through closeRef at keypress time.
  }, [enabled, panelRef, initialFocusRef]);
}
