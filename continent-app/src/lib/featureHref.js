/**
 * The address of an item page, as a link the page can carry (T499, row
 * T491-l; carta-design "Navigation": anything that opens a page is an
 * <a href> with that page's URL).
 *
 * The same hashes the share links write (trailShareUrl, beachShareUrl,
 * lakeShareUrl, mountainShareUrl, the #cycle= reader in lib/cycling.js and
 * destShareUrl), kept relative so a modifier click or "Open in new tab" lands
 * on this same app, where the boot readers open the page. A plain click is
 * still handled in place by the caller (linkOpener below), so the app does
 * not reload.
 *
 * Accepts both spellings of a layer in use: the dossier's plural ('trails')
 * and the loader's singular ('trail').
 */
const HASH = {
  trail: ['trail', 'tc'], trails: ['trail', 'tc'],
  beach: ['beach', 'bc'], beaches: ['beach', 'bc'],
  lake: ['lake', 'lc'], lakes: ['lake', 'lc'],
  mountain: ['mtn', 'mc'], mountains: ['mtn', 'mc'],
  cycling: ['cycle', 'cc'], cycle: ['cycle', 'cc'],
};

export function featureHref(layer, ref) {
  if (!ref || ref.id == null || ref.id === '') return null;
  if (layer === 'dest' || layer === 'destination') return `#dest=${encodeURIComponent(ref.id)}`;
  const pair = HASH[layer];
  if (!pair) return null;
  const [key, ccKey] = pair;
  const cc = ref.cc || ref.country || '';
  return `#${key}=${encodeURIComponent(ref.id)}${cc ? `&${ccKey}=${encodeURIComponent(cc)}` : ''}`;
}

/** A click handler for a real link that opens its page in place: a plain
 *  primary click runs `open`, a modifier or middle click is left to the
 *  browser so it can open a new tab. */
export function linkOpener(open) {
  return (e) => {
    if (!e || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    open?.();
  };
}
