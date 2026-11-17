// House style (plan lane): the blaze paints onto the step in hand only after
// the traveller's own step (the step changed a moment ago), never at a flow's
// first paint, also when a flow opens again later in the visit. Presentation
// only: it decides a CSS class, nothing else.
const lastNow = { step: null, at: 0 };

export function paintsNow(step) {
  return Boolean(lastNow.step) && lastNow.step !== step && Date.now() - lastNow.at < 15000;
}

export function noteNow(step) {
  lastNow.step = step;
  lastNow.at = Date.now();
}
