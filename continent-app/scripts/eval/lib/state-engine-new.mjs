/*
 * The new path of the E9 harness (state-engine.mjs): the app's own helpers, by
 * the names the journeys use. Eval first (logic wave 2): until the helpers
 * land, each one throws, so the old path is recorded before any behaviour moves.
 */
const notYet = (name) => () => { throw new Error(`E9 new path: ${name} is not built yet`); };

export const initForLoad = notYet('initForLoad');
export const isForeignLink = notYet('isForeignLink');
export const mergeAccountChoicesHeld = notYet('mergeAccountChoicesHeld');
export const newTripChoices = notYet('newTripChoices');
export const langToPush = notYet('langToPush');
