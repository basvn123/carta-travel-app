/**
 * The house springs (G1, G5; house style 2026-11, DESIGN.md "Motion & Micro-interaction").
 * One vocabulary for every moving thing, so a CSS control and a Motion
 * control move the same way: the CSS linear() easings in 01-tokens.css
 * (--ease-tick, --ease-pop, --ease-settle) are generated from these by
 * scripts/ci/spring-easings.mjs. Change a spring here, run that script,
 * paste its lines; never hand-edit the linear() strings.
 *
 *   tick     the trill: only the control the finger touched (4.6 % overshoot)
 *   pop      the Add icon only (heart, plus to tick; 12.6 %)
 *   settle   figures, rows gliding, plates and the chosen pin (no overshoot)
 *   surface  sheets, toasts, dialogs
 *   route    a page pushed by Motion (not the view transition)
 *   reveal   home page only
 *   fling    every gesture release; keeps the finger's velocity
 *
 * Plain data and one hook; no motion/react import here, so the CSS
 * generator and the tests read it without a DOM.
 */
export const SPRING = {
  tick: { type: 'spring', visualDuration: 0.18, bounce: 0.3 },
  pop: { type: 'spring', visualDuration: 0.26, bounce: 0.45 },
  settle: { type: 'spring', visualDuration: 0.2, bounce: 0 },
  surface: { type: 'spring', visualDuration: 0.32, bounce: 0 },
  route: { type: 'spring', visualDuration: 0.36, bounce: 0 },
  reveal: { type: 'spring', visualDuration: 0.64, bounce: 0 },
  fling: { type: 'spring', stiffness: 400, damping: 40, mass: 1 },
};

/** The end state at once: what every token becomes under reduced motion. */
export const INSTANT = { duration: 0 };

/**
 * The transition for one token, or INSTANT when the traveller asked the
 * system for less motion. Pass the answer of motion/react's
 * useReducedMotion() (or prefersReducedMotion() outside React).
 */
export function motionToken(name, reduced) {
  return reduced ? INSTANT : (SPRING[name] || SPRING.settle);
}
