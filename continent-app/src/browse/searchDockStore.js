/*
 * The search dock's shared state (T961, T962). The dock lives in the top
 * bar (App), the views it searches live in their tabs; this tiny store is
 * the line between them, the way askChatStore is for Ask Carta.
 *
 *   kind       the activity on screen ('places', 'trails', 'beaches',
 *              'lakes', 'mountains', 'cycling'); a tab writes it while active
 *   results    null on an overview, or { label, query, filterCount, filtersOpen }
 *              while a tab shows a searched or filtered list: the dock then
 *              draws Back and the one Filters button
 *   showAll    a counter a submit with no Where text bumps, so Places opens
 *              every place (its overview's old "Search" with an empty field)
 *
 * The handlers for Back and Filters are kept beside the state, not in it, so
 * a tab that re-renders never makes the dock re-render.
 */
import { useSyncExternalStore } from 'react';

let state = { kind: 'places', results: null, showAll: 0, tools: null };
let handlers = { onBack: null };
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function setDockKind(kind) {
  if (!kind || state.kind === kind) return;
  state = { ...state, kind };
  emit();
}

export function setDockResults(results) {
  const a = state.results;
  const same = (!a && !results) || (a && results && a.label === results.label && a.query === results.query
    && a.filterCount === results.filterCount && a.filtersOpen === results.filtersOpen
    && !!a.canShare === !!results.canShare);
  if (same) return;
  state = { ...state, results: results || null };
  emit();
}

export function setDockHandlers(next) {
  handlers = { ...handlers, ...next };
}

export function dockBack() { handlers.onBack?.(); }
// G12: Share left the phone toolbar for the applied field; the tab that
// sets `canShare` on its results gives the handler.
export function dockShare() { handlers.onShare?.(); }

/*
 * G12 round 2: the tab's tools as plain data (compared field by field, so a
 * tab that re-renders on every stays file does not re-render a reader; null
 * on unmount) and their handlers (setDockHandlers({ onOpenFilters(opener),
 * onView(view), onShortcut(key) })). The band itself reads the filters from
 * filters/filtersStore.js and the view from the tab row's props.
 *
 *   tools   null, or { filterCount, filtersOpen, view: 'list' | 'map', shortcut }
 */
const TOOL_KEYS = ['filterCount', 'filtersOpen', 'view', 'shortcut'];
export function setDockTools(tools) {
  const a = state.tools;
  const b = tools ? Object.fromEntries(TOOL_KEYS.map((k) => [k, tools[k] ?? null])) : null;
  if ((!a && !b) || (a && b && TOOL_KEYS.every((k) => a[k] === b[k]))) return;
  state = { ...state, tools: b };
  emit();
}
export function dockOpenFilters(opener) { handlers.onOpenFilters?.(opener || null); }
export function dockView(view) { handlers.onView?.(view); }
export function dockShortcut(key) { handlers.onShortcut?.(key); }

export function requestShowAll() {
  state = { ...state, showAll: state.showAll + 1 };
  emit();
}

export function useSearchDock() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state,
    () => state,
  );
}

/** A question for Ask Carta rather than a place's name (T906, moved here
 *  for the dock): it asks, or it is longer than a name, or it carries a
 *  figure. */
export function isQuestion(q) {
  const s = String(q || '').trim();
  if (!s) return false;
  return /\?$/.test(s) || /\d|€/.test(s) || s.split(/\s+/).length >= 4;
}

/* Recent searches, this device only: the last five, newest first. */
const RECENT_KEY = 'carta.dock.recent';
export function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && typeof r.q === 'string' && r.q && r.kind).slice(0, 5) : [];
  } catch { return []; }
}
export function rememberSearch(kind, q) {
  const text = String(q || '').trim().slice(0, 80);
  if (!text) return;
  try {
    const rest = loadRecent().filter((r) => !(r.kind === kind && r.q.toLowerCase() === text.toLowerCase()));
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ kind, q: text }, ...rest].slice(0, 5)));
  } catch { /* private mode: the dock still searches, it just does not remember */ }
}
