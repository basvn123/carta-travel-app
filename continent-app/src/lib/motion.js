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
