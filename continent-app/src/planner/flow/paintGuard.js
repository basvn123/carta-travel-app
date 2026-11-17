import { useEffect, useRef } from 'react';

// House style (plan lane): the blaze paints onto the step in hand only after
// the traveller's own step, never at a flow's first paint. A step mark paints
// when its step changes while the view stays mounted, or when the view
// mounts again right after the previous one left (a step that remounts its
// head). Opening a flow cold, also later in the visit, stays still.
// Presentation only: it decides a CSS class, nothing else.
const left = { step: null, at: 0 };

export function usePaintOnStep(step) {
  const seen = useRef({ step: undefined, paint: false });
  const latest = useRef(step);
  latest.current = step;
  if (seen.current.step !== step) {
    const first = seen.current.step === undefined;
    const handOver = first && left.step !== null && left.step !== step && Date.now() - left.at < 1500;
    seen.current = { step, paint: first ? handOver : true };
  }
  useEffect(() => () => { left.step = latest.current; left.at = Date.now(); }, []);
  return seen.current.paint;
}

/** The chosen row's mark ticks only after the traveller's own pick, never
 *  for a row that arrives already chosen: a tap or a key on a choice row
 *  marks its step (`data-picked`), and the CSS tick is scoped to that mark.
 *  The flow's step clears it on a step change (useStepIn); the wizard's
 *  step remounts, so a new step starts without it. Presentation only. */
export function usePickTick(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const mark = (e) => {
      const row = e.target instanceof Element ? e.target.closest('.ui-crow') : null;
      const step = row?.closest('.pf-step, .guide-canvas');
      if (step) step.dataset.picked = '';
    };
    root.addEventListener('click', mark);
    root.addEventListener('keydown', mark);
    return () => {
      root.removeEventListener('click', mark);
      root.removeEventListener('keydown', mark);
    };
  }, [ref]);
}

/** The question settles in when the step changes (not at first paint): the
 *  class is taken off and put back so the CSS animation plays again on the
 *  same element, without remounting the step. Presentation only. */
export function useStepIn(ref, step) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el) return;
    // A new step starts unpicked: its preselected row does not tick.
    delete el.dataset.picked;
    el.classList.remove('pl-step-in');
    void el.offsetWidth; // restart the animation
    el.classList.add('pl-step-in');
  }, [ref, step]);
}
