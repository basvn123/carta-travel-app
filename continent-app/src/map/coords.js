// Guards that keep non-finite coordinates from ever reaching MapLibre.
//
// MapLibre's LngLat constructor throws on NaN/Infinity (the "Invalid LngLat
// object: (NaN, -90)" crash), and setLngLat / flyTo / jumpTo / easeTo /
// fitBounds / LngLatBounds all funnel through it. Because a single throw during
// one of those calls bubbles up to the app-wide ErrorBoundary, ONE bad point
// (a half-geocoded stay, a dropped city_lat, a stale saved plan, an origin that
// no longer resolves) would blank the entire app on load, and "Try again" just
// re-crashes on the same persisted state. Every coordinate that flows into a
// map goes through here first, so a bad point is quietly skipped instead.

// A real, finite number. Rejects null, undefined, NaN, +/-Infinity, and the
// numeric strings that `!= null` checks let slip through.
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// True when a { lat, lon } pair is safe to hand to MapLibre.
export const hasLngLat = (o) => !!o && isNum(o.lat) && isNum(o.lon);

// [lon, lat] tuple for MapLibre, or null when either coordinate is unusable.
export const lngLat = (o) => (hasLngLat(o) ? [o.lon, o.lat] : null);

// Keep only the points MapLibre can actually plot.
export const finitePts = (arr) => (Array.isArray(arr) ? arr.filter(hasLngLat) : []);

/**
 * Stop DOM-marker pins from stacking into an unreadable pile.
 *
 * MapLibre's own symbol layers hide colliding labels for you; markers built as
 * DOM elements get no such treatment, so a dense region (five towns along one
 * stretch of the Costa Brava) renders five overlapping name pills, none of
 * them readable and only the topmost clickable.
 *
 * This is the same greedy pass a symbol layer runs, applied to DOM pins:
 * project every pin to screen space, walk them in priority order, and demote
 * any pin whose box overlaps one already placed. Demotion is two-stage, so
 * information degrades instead of disappearing:
 *   1. `is-tight`  - drop the name, keep the icon and the rating
 *   2. `is-dot`    - drop to a bare dot
 * A pin that is selected, focused or hovered is never demoted: the one the
 * traveller is looking at always keeps its label.
 *
 * `entries()` returns [{ el, lngLat, priority }] fresh on each pass, so
 * callers can reflect selection changes without re-registering.
 * Returns a teardown function.
 */
export function declutterPins(map, entries, { padding = 2 } = {}) {
  let raf = 0;
  const run = () => {
    raf = 0;
    const list = entries();
    if (!list.length) return;
    // Measure first, mutate after: reading offsetWidth between class changes
    // would thrash layout once per pin.
    const items = [];
    for (const e of list) {
      if (!e || !e.el || !e.lngLat) continue;
      e.el.classList.remove('is-tight', 'is-dot');
      items.push(e);
    }
    const placed = [];
    // Highest priority first, then north-to-south so the order is stable as
    // the map pans (an unstable order makes labels flicker on every frame).
    items.sort((a, b) => (b.priority || 0) - (a.priority || 0)
      || (a.lngLat[1] === b.lngLat[1] ? 0 : b.lngLat[1] - a.lngLat[1]));
    for (const it of items) {
      let pt;
      try { pt = map.project(it.lngLat); } catch { continue; }
      const hit = (el) => {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (!w || !h) return null;
        const r = {
          l: pt.x - w / 2 - padding, r: pt.x + w / 2 + padding,
          t: pt.y - h / 2 - padding, b: pt.y + h / 2 + padding,
        };
        return placed.some((p) => !(r.r < p.l || r.l > p.r || r.b < p.t || r.t > p.b)) ? null : r;
      };
      // Pinned pins keep their full label whatever else is around them.
      if (it.el.classList.contains('on') || it.el.classList.contains('focused')
        || it.el.classList.contains('sel')) {
        const r = hit(it.el);
        placed.push(r || {
          l: pt.x - 20, r: pt.x + 20, t: pt.y - 12, b: pt.y + 12,
        });
        continue;
      }
      let rect = hit(it.el);
      if (!rect) { it.el.classList.add('is-tight'); rect = hit(it.el); }
      if (!rect) { it.el.classList.add('is-dot'); rect = hit(it.el); }
      // Still colliding as a dot: leave it a dot and let it overlap. Hiding it
      // outright would silently remove a place from the map.
      if (rect) placed.push(rect);
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
  map.on('move', schedule);
  map.on('zoom', schedule);
  map.on('moveend', schedule);
  schedule();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    map.off('move', schedule);
    map.off('zoom', schedule);
    map.off('moveend', schedule);
  };
}

/**
 * Keep a picker map correct when its container changes size.
 *
 * The wizard's maps live in panels whose height depends on the viewport and on
 * which step is showing, so a fitBounds computed at mount can be stale a
 * moment later, leaving pins outside the visible canvas. Re-fit on resize, but
 * only until the traveller pans or zooms themselves: after that the view is
 * theirs and yanking it back would be worse than a slightly loose fit.
 *
 * Returns a disconnect function for the effect cleanup.
 */
export function keepFitted(map, container, getBounds) {
  let touched = false;
  const mark = (e) => { if (e.originalEvent) touched = true; };
  map.on('dragstart', mark);
  map.on('zoomstart', mark);
  const ro = new ResizeObserver(() => {
    map.resize();
    if (touched) return;
    const b = getBounds();
    if (b) map.fitBounds(b.bounds, { padding: b.padding, maxZoom: b.maxZoom, duration: 0 });
  });
  ro.observe(container);
  return () => ro.disconnect();
}
