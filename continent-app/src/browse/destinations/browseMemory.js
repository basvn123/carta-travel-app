import { browseQueryFrom } from '../../lib/urlState.js';

/**
 * Remembered browse state (T384, brief V3-8, rule N10): the category, the
 * country and the near place of the last visit, per viewer, in this
 * browser. A convenience and nothing more: every read and write is in a
 * try/catch (a private window, blocked storage or a thumbnail capture can
 * all throw or come back empty), anything malformed is ignored, and the tab
 * is correct without it. A link that names a category, a country or a place
 * still wins, because those arrive through their own effects after this.
 */
const MEMORY_KEY = 'carta.places.v1';

export function readMemory() {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const m = raw ? JSON.parse(raw) : null;
    if (!m || typeof m !== 'object') return null;
    const near = m.near && typeof m.near === 'object'
      && typeof m.near.name === 'string'
      && Number.isFinite(m.near.lat) && Number.isFinite(m.near.lon)
      ? {
        id: typeof m.near.id === 'string' ? m.near.id : null,
        name: m.near.name,
        sub: typeof m.near.sub === 'string' ? m.near.sub : '',
        iso2: typeof m.near.iso2 === 'string' && /^[A-Z]{2}$/.test(m.near.iso2) ? m.near.iso2 : null,
        lat: m.near.lat,
        lon: m.near.lon,
      }
      : null;
    return {
      cat: typeof m.cat === 'string' ? m.cat : null,
      country: typeof m.country === 'string' && /^[A-Z]{2}$/.test(m.country) ? m.country : '',
      near,
    };
  } catch {
    return null;
  }
}

/** The section (dc), country (dn) and Where text (dq, T600) a link names,
 *  or nothing (T428). */
export function readUrlBrowse() {
  try {
    const p = new URLSearchParams(window.location.search);
    const cat = p.get('dc');
    const cc = (p.get('dn') || '').toUpperCase();
    return { cat: cat || null, country: /^[A-Z]{2}$/.test(cc) ? cc : '', q: browseQueryFrom(window.location.search) };
  } catch {
    return { cat: null, country: '', q: '' };
  }
}

export function writeMemory(m) {
  try { window.localStorage.setItem(MEMORY_KEY, JSON.stringify(m)); } catch { /* storage refused: nothing to keep */ }
}
