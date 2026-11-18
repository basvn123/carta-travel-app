/**
 * Recent searches (G12): the last picks, shown when the search opens empty.
 * A result is stored as it was suggested (type, name, position or box,
 * tokens) and resolved again when picked, so a recent search follows the
 * catalogue as it grows. localStorage can be off or full; then the list is
 * simply empty.
 */
const KEY = 'carta.search.recent';
export const MAX_RECENT = 5;

const FIELDS = ['type', 'key', 'id', 'gid', 'name', 'cc', 'code', 'lat', 'lon', 'bbox', 'tokens'];

function slim(result) {
  const out = {};
  for (const f of FIELDS) if (result[f] !== undefined) out[f] = result[f];
  return out;
}

export function readRecent(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && r.type && r.key).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecent(result, storage = globalThis.localStorage) {
  if (!result?.type || !result.key) return readRecent(storage);
  const list = [slim(result), ...readRecent(storage).filter((r) => r.key !== result.key)].slice(0, MAX_RECENT);
  try { storage?.setItem(KEY, JSON.stringify(list)); } catch { /* storage off: nothing kept */ }
  return list;
}

export function clearRecent(storage = globalThis.localStorage) {
  try { storage?.removeItem(KEY); } catch { /* storage off */ }
  return [];
}
