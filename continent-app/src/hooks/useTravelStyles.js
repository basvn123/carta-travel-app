import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STYLES_KEY, activeStyle, addStyle, choicesFromStyle, choicesMatchStyle, duplicateStyle, exploreFromTaste, isForeignLink, normalizeStyles, styleWithTaste,
  removeStyle, setActive, styleFromChoices, styleFromTemplate, tasteFromStyle, tasteMatchesStyle, updateStyle,
} from '../lib/travelStyles.js';
import { normalizeTaste } from '../lib/taste.js';

/** lib/urlState.js's localStorage mirror of the address it last wrote. */
const URL_MIRROR_KEY = 'continent.state.v1';

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
 * `choices.travel_styles`. Three rules live here:
 *
 *  1. The active style follows the app's choices: a bed changed in the
 *     Lifestyle panel, a head count on the settings line or the way there on
 *     the planner is written into the active style, so there is one truth
 *     and no "save to style" step for the stay half.
 *  2. Switching a style writes its stay half into the choices in the same
 *     update, so rule 1 sees nothing to follow and every price reprices once.
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
  // On the first run the choices were read at load, not edited: when the
  // address named none of the priced keys (a bookmark, a tab link) the style
  // is the truth and sets them; when a shared link named them, the link's
  // choices stand and no style is marked active, so neither overwrites the
  // other (lib/travelStyles.js: active '' is "no style").
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      let mirror = '';
      try { mirror = window.localStorage.getItem(URL_MIRROR_KEY) || ''; } catch { /* private mode */ }
      const linked = typeof window !== 'undefined' && isForeignLink(window.location.search, mirror);
      setChoices((prev) => {
        const st = normalizeStyles(prev.travel_styles);
        const a = activeStyle(st);
        if (!a || choicesMatchStyle(a, prev)) return prev;
        if (linked) return { ...prev, travel_styles: { ...st, active: '' } };
        return { ...prev, ...choicesFromStyle(a) };
      });
      return;
    }
    setChoices((prev) => {
      const st = normalizeStyles(prev.travel_styles);
      const a = activeStyle(st);
      if (!a) return prev;
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
      return s ? { ...prev, ...choicesFromStyle(s), travel_styles: st } : prev;
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
      return made ? { ...prev, ...choicesFromStyle(made), travel_styles: st } : prev;
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
      return next ? { ...prev, ...choicesFromStyle(next), travel_styles: st } : { ...prev, travel_styles: st };
    });
  }, [setChoices]);
  const duplicate = useCallback((id, name) => write((st) => duplicateStyle(st, id, name)), [write]);

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
  }), [store, active, open, setOpen, switchTo, create, update, remove, duplicate]);
}
