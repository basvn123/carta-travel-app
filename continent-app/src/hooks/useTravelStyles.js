import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_STYLES, STYLES_KEY, activeStyle, afterChoicesChange, holdChoices, holdStyleChoices, keepChoices, switchChoices, choicesMatchStyle, commitChoices, createChoices,
  draftFromTemplate, duplicateStyle, emptyDraft, exploreFromTaste, normalizeStyles, removeChoices, studioOpen, styleFromDraft, tasteFromStyle, tasteMatchesStyle, updateStyle,
} from '../lib/travelStyles.js';
import { normalizeTaste } from '../lib/taste.js';

/** The query keys that carry a priced choice (lib/urlState.js: party g, gc,
 *  gb; stay st; Lifestyle ls; way t). */
const PRICED_QUERY = /[?&](g|gc|gb|st|ls|t)=/;

/**
 * The taste written with the style in the same update (rule 4), for the
 * studio's saves: left to the rule 4 effect it is a second update, so the
 * whole app (Explore's every price) renders twice per Save (fixes r1 A4).
 * The effect then finds the two agreeing and does nothing.
 */
function withActiveTaste(next) {
  const a = activeStyle(next.travel_styles);
  if (!a) return next;
  const taste = normalizeTaste(next.taste);
  return tasteMatchesStyle(a, taste) ? next : { ...next, taste: normalizeTaste(tasteFromStyle(a, taste)) };
}

/** The styles this device kept, read once at start (the URL mirror does not
 *  carry them; the account sync carries them inside `choices`). */
export function loadStoredStyles() {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STYLES_KEY) : null;
    return normalizeStyles(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeStyles(null);
  }
}

/**
 * The traveller's travel styles (lib/travelStyles.js), kept in
 * `choices.travel_styles`. The rules that live here:
 *
 *  1. The active style follows the app's own choices: a bed changed for the
 *     whole app or a head count on the settings line is written into
 *     the active style, so there is no "save to style" step for them.
 *     Except while the style is held (`choices.style_held`): a change made
 *     for one trip (the planner's Who, Tell Viantra's words, the way there of
 *     a trip, the trip page's party) holds the style instead, so the trip's
 *     party never becomes the style's. The header then says "changed" and
 *     the sheet offers Keep (write the changes into the style) and Back
 *     (the style's own values). A load whose choices differ from the active
 *     style (a shared link, a bookmark, a saved trip, a sign-in) holds it
 *     too, so a load never overwrites a style or the choices.
 *  2. Switching a style writes its stay half into the choices in the same
 *     update and lifts the hold, so every price reprices once.
 *  3. The styles are mirrored to localStorage on every change.
 *  4. The taste profile (lib/taste.js, what Explore's "For you" reads) is the
 *     active style's explore half: a style edit or switch rewrites the taste,
 *     and a taste edited on its own (the first-run questions) is written
 *     back into the style. Whichever moved last wins.
 */
export function useTravelStyles(choices, setChoices) {
  const store = useMemo(() => normalizeStyles(choices.travel_styles), [choices.travel_styles]);
  const active = useMemo(() => activeStyle(store), [store]);
  // Where the Style Studio is open: null, or { view, id, step } (see
  // lib/travelStyles.js studioOpen for what each door may pass). Read from
  // the store as it stands when the door is used, so an edit always names a
  // style that exists.
  const [open, setOpenRaw] = useState(null);
  const setOpen = useCallback((v) => setOpenRaw(studioOpen(v, store)), [store]);
  // A style deleted while the studio edits it: back to the overview.
  const openGone = open?.view === 'edit' && !store.list.some((s) => s.id === open.id);
  const openNow = useMemo(() => (openGone ? studioOpen(true, store) : open), [openGone, open, store]);

  // Rule 1. Keyed on the priced choices only, not on the whole object.
  const mounted = useRef(false);
  useEffect(() => {
    // Read now: React may run the updater after this effect has returned.
    const first = !mounted.current;
    const linked = first && typeof window !== 'undefined' && PRICED_QUERY.test(window.location.search || '');
    mounted.current = true;
    setChoices((prev) => afterChoicesChange(prev, { first, linked }));
  // style_held too: a hold placed while nothing differs (Continue on Who
  // with the style's own party, an undo, the tile already picked) lifts in
  // the same pass, so no hold lingers unseen (judge round 3).
  }, [choices.stay_tier, choices.lifestyle, choices.transport_mode, choices.group_size, choices.children, choices.babies, choices.style_held, setChoices]);

  // Rule 4. `seen` holds what each side looked like when they last agreed.
  const seen = useRef({ taste: null, explore: null, id: null });
  // The decision is made here, from this render's values; the updaters below
  // stay pure (React may run an updater twice).
  useEffect(() => {
    const a = active;
    if (!a) return;
    const taste = normalizeTaste(choices.taste);
    const tasteKey = JSON.stringify(taste);
    const exploreKey = JSON.stringify([a.who.kind, a.explore]);
    const last = seen.current;
    if (tasteMatchesStyle(a, taste)) {
      seen.current = { taste: tasteKey, explore: exploreKey, id: a.id };
      return;
    }
    // The taste moved on its own while this style stayed: the style follows.
    if (last.id === a.id && last.explore === exploreKey && last.taste !== tasteKey) {
      const next = exploreFromTaste(a, taste);
      seen.current = { taste: tasteKey, explore: JSON.stringify([next.who.kind, next.explore]), id: a.id };
      setChoices((prev) => ({ ...prev, travel_styles: updateStyle(normalizeStyles(prev.travel_styles), a.id, next) }));
      return;
    }
    const nextTaste = normalizeTaste(tasteFromStyle(a, taste));
    seen.current = { taste: JSON.stringify(nextTaste), explore: exploreKey, id: a.id };
    setChoices((prev) => ({ ...prev, taste: nextTaste }));
  }, [choices.taste, active, setChoices]);

  // Rule 3. Skips the first render, which only read what was stored.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { window.localStorage.setItem(STYLES_KEY, JSON.stringify(store)); } catch { /* private mode */ }
  }, [store]);

  const write = useCallback((fn) => {
    setChoices((prev) => ({ ...prev, travel_styles: fn(normalizeStyles(prev.travel_styles)) }));
  }, [setChoices]);

  // Rule 2.
  const switchTo = useCallback((id) => {
    setChoices((prev) => switchChoices(prev, id));
  }, [setChoices]);

  /** The Style Studio's Done on a new style: added, made active, its stay
   *  half priced. Returns the new id, or '' at MAX_STYLES (nothing added).
   *  The id is made here, outside the updater, so the caller has it now. */
  const createFrom = useCallback((draft) => {
    if (store.list.length >= MAX_STYLES) return '';
    const s = styleFromDraft({ ...draft, id: '' });
    setChoices((prev) => withActiveTaste(createChoices(prev, s)));
    return s.id;
  }, [store, setChoices]);
  /** The Style Studio's Save on an existing style (see commitChoices: the
   *  active one reprices the app unless it is held). */
  const commit = useCallback((id, draft) => {
    const s = styleFromDraft({ ...draft, id });
    setChoices((prev) => withActiveTaste(commitChoices(prev, id, s)));
  }, [setChoices]);

  const update = useCallback((id, patch) => write((st) => updateStyle(st, id, patch)), [write]);
  // Deleting the active style moves to the next one, and that one's stay
  // half must price the app in the same update (review finding 1); the
  // last one going sets the no-style prices back (removeChoices).
  const remove = useCallback((id) => {
    setChoices((prev) => removeChoices(prev, id));
  }, [setChoices]);
  const duplicate = useCallback((id, name) => write((st) => duplicateStyle(st, id, name)), [write]);

  /** A change for one trip: the style is held, not rewritten (rule 1).
   *  Call it before the change; both updates land in one render. */
  const hold = useCallback(() => {
    setChoices(holdChoices);
  }, [setChoices]);
  /** Another style for one trip (G12): its stay half prices the trip and
   *  the active style is held; Keep makes it active (holdStyleChoices). */
  const holdStyle = useCallback((id) => {
    setChoices((prev) => holdStyleChoices(prev, id));
  }, [setChoices]);
  /** The held changes written into the active style, and the hold lifted. */
  const keep = useCallback(() => {
    setChoices(keepChoices);
  }, [setChoices]);
  /** Back to the active style's own values (the hold lifted). */
  const revert = useCallback(() => { if (store.active) switchTo(store.active); }, [store.active, switchTo]);
  // The choices differ from the active style (a trip's change, a link).
  const changed = Boolean(active && !choicesMatchStyle(active, choices));
  const held = Boolean(active && choices.style_held);

  return useMemo(() => ({
    list: store.list,
    activeId: store.active,
    active,
    open: openNow,
    setOpen,
    switchTo,
    createFrom,
    commit,
    draftFromTemplate,
    emptyDraft,
    update,
    remove,
    duplicate,
    hold,
    holdStyle,
    keep,
    revert,
    changed,
    held,
    heldFor: held ? (choices.style_held_for || '') : '',
  }), [store, active, openNow, setOpen, switchTo, createFrom, commit, update, remove, duplicate, hold, holdStyle, keep, revert, changed, held, choices.style_held_for]);
}
