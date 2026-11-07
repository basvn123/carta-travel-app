/**
 * Place linking (T1153, ROADMAP F4): the one function parse-booking, Ask and
 * search share. linker.js and aliases.js are pure and run in Deno as well;
 * search.js is the browser search box's adapter.
 */
export { makeLinker, linkPlace, LINK_DEFAULTS } from './linker.js';
export { buildAliases, KIND_WEIGHT } from './aliases.js';
export { fold, clean } from './fold.js';
