/**
 * The wish hatch on the Saved plate (G12 atlas, judge round 1): how a
 * country with a saved place is drawn. Been keeps its been fill and the
 * hatch is laid over it ('over'); the next trip keeps its own hatch
 * ('next'); any other land takes the hatch as its fill ('fill').
 * Pure, so the rule is tested without a browser.
 */
export function wishDraw(state, inWish) {
  if (state === 'next') return 'next';
  if (!inWish) return '';
  return state === 'been' ? 'over' : 'fill';
}
