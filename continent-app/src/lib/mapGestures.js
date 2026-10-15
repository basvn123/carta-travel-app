/**
 * How a map inside a scrolling page answers the traveller's hands (T430,
 * carta-design "3D terrain map": maps on a page never ask for Ctrl or Cmd).
 *
 * MapLibre offers two choices out of the box, and neither fits a page:
 * cooperativeGestures makes a two-finger trackpad swipe scroll the page and
 * asks for Ctrl to zoom (the owner's complaint on the beach, lake and summit
 * pages), while plain scrollZoom turns the same swipe into a zoom. A laptop
 * trackpad already says what the hand means: two fingers sliding is a pan,
 * a pinch is a zoom (the browser reports it as a wheel with ctrlKey set), and
 * a mouse wheel turns in steps. So:
 *
 *   trackpad swipe     -> pan the map by the swipe
 *   trackpad pinch     -> MapLibre's own scroll zoom (ctrl wheel)
 *   mouse wheel        -> MapLibre's own scroll zoom
 *   Safari pinch       -> gesturechange, zoom about the pointer
 *
 * A mouse wheel is told from a trackpad by its whole notches: deltaMode 1
 * (lines, Firefox) or a wheelDeltaY that is a multiple of 120 with no
 * sideways part (Chrome and Safari report a notch as 120). Anything else in
 * pixels is a trackpad.
 *
 * On a coarse pointer the map in the page flow does not move under a finger,
 * so a thumb scrolling the page is never caught by it; the page's Expand
 * control (MapTools.jsx) opens it full screen and calls setInteractive(true).
 */

export function isMouseWheel(e) {
  if (!e) return false;
  if (e.deltaMode === 1 || e.deltaMode === 2) return true;
  const wy = typeof e.wheelDeltaY === 'number' ? e.wheelDeltaY : null;
  if (wy != null && wy !== 0 && wy % 120 === 0 && !e.deltaX) return true;
  return false;
}

export function isCoarsePointer() {
  try {
    return typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches
      && !window.matchMedia('(any-pointer: fine)').matches;
  } catch { return false; }
}

const HANDLERS = ['dragPan', 'touchZoomRotate', 'doubleClickZoom'];

/**
 * Wire one map. Returns { setInteractive, dispose }.
 * `coarse` can be forced by a test; by default it reads the pointer.
 */
export function installMapGestures(map, { coarse = isCoarsePointer() } = {}) {
  if (!map || typeof map.getContainer !== 'function') return { setInteractive() {}, dispose() {} };
  const box = map.getContainer();
  let interactive = !coarse;

  const onWheel = (e) => {
    if (!interactive) return;
    if (e.ctrlKey || e.metaKey || isMouseWheel(e)) return; // MapLibre zooms
    e.preventDefault();
    e.stopPropagation();
    map.panBy([e.deltaX, e.deltaY], { duration: 0 });
  };

  let lastScale = 1;
  const onGestureStart = (e) => { if (!interactive) return; e.preventDefault(); lastScale = 1; };
  const onGestureChange = (e) => {
    if (!interactive) return;
    e.preventDefault();
    const scale = Number(e.scale) || 1;
    const step = Math.log2(scale / lastScale);
    lastScale = scale;
    if (!Number.isFinite(step) || step === 0) return;
    const r = box.getBoundingClientRect();
    const around = map.unproject([(e.clientX ?? r.left + r.width / 2) - r.left, (e.clientY ?? r.top + r.height / 2) - r.top]);
    map.zoomTo(map.getZoom() + step, { duration: 0, around });
  };

  box.addEventListener('wheel', onWheel, { capture: true, passive: false });
  box.addEventListener('gesturestart', onGestureStart, { passive: false });
  box.addEventListener('gesturechange', onGestureChange, { passive: false });

  const setInteractive = (on) => {
    interactive = Boolean(on);
    for (const name of HANDLERS) {
      const h = map[name];
      if (!h) continue;
      if (interactive) h.enable(); else h.disable();
    }
    if (map.scrollZoom) { if (interactive) map.scrollZoom.enable(); else map.scrollZoom.disable(); }
    box.classList.toggle('is-still', !interactive);
  };
  setInteractive(interactive);

  return {
    setInteractive,
    get interactive() { return interactive; },
    coarse,
    dispose() {
      box.removeEventListener('wheel', onWheel, { capture: true });
      box.removeEventListener('gesturestart', onGestureStart);
      box.removeEventListener('gesturechange', onGestureChange);
    },
  };
}
