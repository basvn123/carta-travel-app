/*
 * The new path of the E9 harness (state-engine.mjs): the app's own helpers, by
 * the names the journeys use, so a journey replays the code the app runs.
 */
import { initForLoad as initForLoadApp, isForeignLink as isForeignLinkApp } from '../../../src/lib/urlState.js';
import { mergeAccountChoices } from '../../../src/lib/taste.js';
import { newTripChoices as newTripChoicesApp } from '../../../src/lib/travelStyles.js';
import { langToPush as langToPushApp } from '../../../src/lib/langPath.js';

export const initForLoad = initForLoadApp;
export const isForeignLink = isForeignLinkApp;
export const mergeAccountChoicesHeld = (local, incoming) => mergeAccountChoices(local, incoming, { hold: true });
export const newTripChoices = newTripChoicesApp;
export const langToPush = (o) => langToPushApp({ ...o, e9: true });
