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
