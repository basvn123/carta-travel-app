/**
 * Keyboard access for a clickable DOM map marker (T190).
 *
 * The maps build their pins as plain elements handed to maplibregl.Marker,
 * and several listened for `click` on a <div>: reachable by mouse and finger,
 * invisible to Tab. This gives such an element what a <button> has for free:
 * a tab stop, the button role, a name, and Enter or Space doing what a click
 * does. The focus ring comes from the `.maplibregl-marker:focus-visible` rule
 * in styles/15-map-overlays.css, an outline rather than a transform because
 * maplibre owns the marker's inline transform (see maplibre-marker-transform
 * in the project notes).
 *
 * Pins created as real <button>s (CityPickerMap, the POI pins in TripMap and
 * DayExploreMap) do not need this. Pins that only show where something is,
 * with no action behind them, must not get it: a tab stop that does nothing
 * is worse than none.
 *
 *   keyablePin(el, 'Colosseum', () => onPick(i), { map, lngLat });
 *   clearKeyablePin(el);   // the pin stopped being clickable
 *
 * With `map` and `lngLat`, a pin that takes focus while it sits outside the
 * map's view pans the map to it first. Without that, Tab walks onto pins the
 * frame has clipped away (after the reader panned with the arrow keys), and
 * focus lands somewhere nobody can see it.
 */
export function keyablePin(el, label, onActivate, { map = null, lngLat = null } = {}) {
  el.tabIndex = 0;
  el.__kbReveal = map && lngLat ? () => {
    try {
      if (!map.getBounds().contains(lngLat)) map.panTo(lngLat, { duration: 0 });
    } catch { /* the map is gone */ }
  } : null;
  el.setAttribute('role', 'button');
  if (label) el.setAttribute('aria-label', label);
  el.__kbLabel = label || '';
  el.__kbPinActivate = onActivate;
  if (el.__kbPin) return;
  el.__kbPin = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Space would scroll the page, and the map's own keyboard handler
    // listens on the canvas container the marker sits in.
    e.preventDefault();
    e.stopPropagation();
    el.__kbPinActivate?.(e);
  };
  el.addEventListener('keydown', el.__kbPin);
  el.addEventListener('focus', () => { showFull(el); el.__kbReveal?.(); });
}

// A pin the declutter pass shrank to a dot (map/coords.js) gets its name
// back while it holds focus, so the reader can see which place it is. The
// pass itself leaves a focused pin alone from then on.
const showFull = (el) => el.classList.remove('is-tight', 'is-dot');

/**
 * maplibre's Marker.addTo() stamps aria-label="Map marker" on the element it
 * is given. On a pin that is a button that label replaces the pin's real name,
 * so a screen reader heard "Map marker" for every highlight, stop and place.
 * Call this after addTo(): it puts back the name keyablePin gave, or the
 * title, and otherwise removes the stamp so the pin's own text names it.
 */
export function nameMarker(el, label = el.__kbLabel || el.title || '') {
  if (label) el.setAttribute('aria-label', label);
  else el.removeAttribute('aria-label');
}

/** The pan-into-view half of keyablePin, for pins that are real <button>s. */
export function revealOnFocus(el, map, lngLat) {
  el.addEventListener('focus', () => {
    showFull(el);
    try {
      if (!map.getBounds().contains(lngLat)) map.panTo(lngLat, { duration: 0 });
    } catch { /* the map is gone */ }
  });
}

export function clearKeyablePin(el) {
  el.removeAttribute('tabindex');
  el.removeAttribute('role');
  el.removeAttribute('aria-label');
  el.__kbPinActivate = null;
}
