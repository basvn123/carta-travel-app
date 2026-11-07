/**
 * The flag that puts the place linker behind the Explore search box (T1153).
 *
 * Off by default. On with any of:
 *   ?link=1 in the page URL (for one visit; ?link=0 turns it off again)
 *   localStorage "carta.placeLinking" = "1"
 *   VITE_PLACE_LINKING=1 at build time
 * Turning it on for everyone is register row T1153-a: the owner looks at
 * the search with it on, then the default flips here.
 */
export const PLACE_LINKING_KEY = 'carta.placeLinking';

export function placeLinkingOn() {
  try {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('link') : null;
    if (q === '1' || q === '0') {
      try { window.localStorage.setItem(PLACE_LINKING_KEY, q); } catch { /* private mode */ }
      return q === '1';
    }
  } catch { /* no window */ }
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(PLACE_LINKING_KEY) === '1') return true;
  } catch { /* storage blocked */ }
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return env.VITE_PLACE_LINKING === '1';
}
