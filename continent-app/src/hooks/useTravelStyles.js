import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STYLES_KEY, activeStyle, addStyle, choicesFromStyle, choicesMatchStyle, duplicateStyle, exploreFromTaste, normalizeStyles, styleWithTaste,
  removeStyle, setActive, styleFromChoices, styleFromTemplate, tasteFromStyle, tasteMatchesStyle, updateStyle,
} from '../lib/travelStyles.js';
import { normalizeTaste } from '../lib/taste.js';

/** The query keys that carry a priced choice (lib/urlState.js: party g, gc,
 *  gb; stay st; Lifestyle ls; way t). */
const PRICED_QUERY = /[?&](g|gc|gb|st|ls|t)=/;

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
 *  1. The active style follows the app's own choices: a bed changed in the
 *     Lifestyle panel or a head count on the settings line is written into
 *     the active style, so there is no "save to style" step for them.
 *     Except while the style is held (`choices.style_held`): a change made
 *     for one trip (the planner's Who, Tell Carta's words, the way there of
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
  // false, or the half the sheet opens on ('stay' | 'explore').
  const [open, setOpenRaw] = useState(false);
  const setOpen = useCallback((v) => setOpenRaw(v === true ? 'stay' : v || false), []);

  // Rule 1. Keyed on the priced choices only, not on the whole object.
  const mounted = useRef(false);
  useEffect(() => {
    // Read now: React may run the updater after this effect has returned.
    const first = !mounted.current;
    const linked = first && typeof window !== 'undefined' && PRICED_QUERY.test(window.location.search || '');
    mounted.current = true;
    setChoices((prev) => {
      const st = normalizeStyles(prev.travel_styles);
      const a = activeStyle(st);
      if (!a || prev.style_held) return prev;
      if (first) {
        // First run: the choices were read at load, not edited. An address
        // that names none of them (the home page, a tab link) brought only
        // defaults, so the style sets them; one that names them (a shared
        // link, this device's own reload) is kept and holds the style.
        if (choicesMatchStyle(a, prev)) return prev;
        return linked ? { ...prev, style_held: true } : { ...prev, ...choicesFromStyle(a) };
      }
      const next = styleFromChoices(a, prev);
      if (next === a) return prev;
      return { ...prev, travel_styles: updateStyle(st, a.id, next) };
    });
  }, [choices.stay_tier, choices.lifestyle, choices.transport_mode, choices.group_size, choices.children, choices.babies, setChoices]);

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
    setChoices((prev) => {
      const st = setActive(normalizeStyles(prev.travel_styles), id);
      const s = st.list.find((x) => x.id === id);
      return s ? { ...prev, ...choicesFromStyle(s), travel_styles: st, style_held: false } : prev;
    });
  }, [setChoices]);

  /** A new style from a template ('' for "from how I travel now"), made active. */
  const create = useCallback((templateId) => {
    setChoices((prev) => {
      const s = templateId
        ? styleWithTaste(styleFromTemplate(templateId, prev), prev.taste)
        : styleWithTaste(styleFromChoices({ tone: 'umber' }, prev), prev.taste, { all: true });
      const st = addStyle(normalizeStyles(prev.travel_styles), s);
      const made = st.list.find((x) => x.id === st.active);
      return made ? { ...prev, ...choicesFromStyle(made), travel_styles: st, style_held: false } : prev;
    });
  }, [setChoices]);

  const update = useCallback((id, patch) => write((st) => updateStyle(st, id, patch)), [write]);
  // Deleting the active style moves to another one, and that one's stay
  // half must price the app in the same update (review finding 1).
  const remove = useCallback((id) => {
    setChoices((prev) => {
      const before = normalizeStyles(prev.travel_styles);
      const st = removeStyle(before, id);
      const next = before.active === id ? activeStyle(st) : null;
      return next ? { ...prev, ...choicesFromStyle(next), travel_styles: st, style_held: false } : { ...prev, travel_styles: st };
    });
  }, [setChoices]);
  const duplicate = useCallback((id, name) => write((st) => duplicateStyle(st, id, name)), [write]);

  /** A change for one trip: the style is held, not rewritten (rule 1).
   *  Call it before the change; both updates land in one render. */
  const hold = useCallback(() => {
    setChoices((prev) => (prev.style_held || !activeStyle(normalizeStyles(prev.travel_styles)) ? prev : { ...prev, style_held: true }));
  }, [setChoices]);
  /** The held changes written into the active style, and the hold lifted. */
  const keep = useCallback(() => {
    setChoices((prev) => {
      const st = normalizeStyles(prev.travel_styles);
      const a = activeStyle(st);
      if (!a) return { ...prev, style_held: false };
      return { ...prev, travel_styles: updateStyle(st, a.id, styleFromChoices(a, prev)), style_held: false };
    });
  }, [setChoices]);
  /** Back to the active style's own values (the hold lifted). */
  const revert = useCallback(() => { if (store.active) switchTo(store.active); }, [store.active, switchTo]);
  // The choices differ from the active style (a trip's change, a link).
  const changed = Boolean(active && !choicesMatchStyle(active, choices));

  return useMemo(() => ({
    list: store.list,
    activeId: store.active,
    active,
    open,
    setOpen,
    switchTo,
    create,
    update,
    remove,
    duplicate,
    hold,
    keep,
    revert,
    changed,
  }), [store, active, open, setOpen, switchTo, create, update, remove, duplicate, hold, keep, revert, changed]);
}
