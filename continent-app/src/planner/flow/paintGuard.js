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
