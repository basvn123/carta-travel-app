import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The reduced-motion question, asked in one place (T186).
 *
 * CSS answers it for every transition and animation (the motion floor in
 * styles/02-base.css), but a script that scrolls with behavior: 'smooth'
 * animates past the stylesheet. Those calls ask scrollBehavior() instead, so
 * a traveller who has asked the system for less motion gets a jump.
 * MapLibre's easeTo and flyTo read the same preference on their own.
 */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 'auto' (a jump) under reduced motion, 'smooth' otherwise. */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/* The motion tokens of src/styles/01-tokens.css (T380), for scripts that
   cannot read a custom property at the moment they need it (MapLibre's
   easeTo, element.animate, a setTimeout that waits for a transition). The
   fallbacks mirror the token file so a test without a DOM gets the same
   numbers. */
const DURATION_FALLBACK_MS = { '--dur-1': 120, '--dur-2': 200, '--dur-3': 320, '--dur-4': 480 };

/**
 * Milliseconds for a duration token ('--dur-1' to '--dur-4'), read from
 * :root; 0 under reduced motion so a caller can pass it straight to an
 * animation API without a second check.
 */
export function durationMs(token) {
  if (prefersReducedMotion()) return 0;
  const fallback = DURATION_FALLBACK_MS[token] ?? 0;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (!raw) return fallback;
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return fallback;
    return /ms$/.test(raw) ? n : n * 1000;
  } catch {
    return fallback;
  }
}

/**
 * Keep a surface mounted while it leaves (T391, design direction v6 part
 * 2.3: a sheet, panel or dialog leaves in --dur-2). Pass whether the surface
 * should be open; get back whether to render it and whether it is on its way
 * out, so the caller can set a leaving class whose animation reads the
 * tokens. Under reduced motion durationMs() is 0 and the surface goes at once.
 *
 *   const { mounted, leaving } = usePresence(open);
 *   {mounted && <Panel className={leaving ? 'is-leaving' : ''} />}
 */
export function usePresence(open, token = '--dur-2') {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    const ms = durationMs(token);
    if (!ms) {
      setMounted(false);
      setLeaving(false);
      return undefined;
    }
    setLeaving(true);
    const id = setTimeout(() => { setMounted(false); setLeaving(false); }, ms);
    return () => clearTimeout(id);
  }, [open, token]);
  return { mounted: mounted || open, leaving: !open && leaving };
}

/**
 * The active-section marker (T391, rule R5 and the selected-state rule): one
 * --ink-fill pill per navigation row that slides between items by transform
 * instead of jumping. It is placed from the measured item marked active
 * (`itemSelector`), so it needs no knowledge of the row's layout; `fit` says what
 * it covers: the whole item (the desktop tabs) or a fixed pill centred on the
 * item's icon (the phone bar, where the label sits under the pill). The first
 * placement and every resize place it without motion; only a change of the
 * active item slides it (--dur-2, --ease-in-out, 60-v6-shell.css). With no
 * active item in the row it hides.
 */
export function useNavMarker(navRef, markerRef, activeKey, { itemSelector = '.active', fit = 'item', iconSelector = '', pillW = 56, pillH = 30 } = {}) {
  const lastKey = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const mk = markerRef.current;
    if (!nav || !mk) return undefined;
    const place = (animate) => {
      const item = nav.querySelector(itemSelector);
      const nb = nav.getBoundingClientRect();
      if (!item || !nb.width) { mk.dataset.on = 'false'; return; }
      const target = fit === 'icon' ? (item.querySelector(iconSelector) || item) : item;
      const r = target.getBoundingClientRect();
      if (!r.width) { mk.dataset.on = 'false'; return; }
      const w = fit === 'icon' ? pillW : r.width;
      const h = fit === 'icon' ? pillH : r.height;
      const x = r.left - nb.left + (r.width - w) / 2;
      const y = r.top - nb.top + (r.height - h) / 2;
      mk.dataset.slide = animate && mk.dataset.on === 'true' ? 'true' : 'false';
      mk.style.width = `${w}px`;
      mk.style.height = `${h}px`;
      mk.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      mk.dataset.on = 'true';
    };
    const changed = lastKey.current !== null && lastKey.current !== activeKey;
    lastKey.current = activeKey;
    place(changed);
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(nav);
    return () => ro.disconnect();
  }, [navRef, markerRef, activeKey, itemSelector, fit, iconSelector, pillW, pillH]);
}
