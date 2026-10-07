// Which screen a visit opens on (T194). The landing page is also the app's
// home (owner decision 2026-10-07, T362), and it opens for a FIRST visit only:
// a visit with no query string, no hash and no earlier visit on this browser.
// A link always wins (a query string or a hash means somebody sent this view),
// and a return visit opens on Destinations as it always has. The brand mark
// and the navigation are unchanged: 'home' has no nav entry.
//
// The mark is written on every load, so the page opens once per browser and a
// reload after leaving it does not bring it back. Storage can throw (private
// windows, blocked site data); then the visit is treated as a return visit,
// which is the old behaviour, never a loop of home pages.
export const HOME_SEEN_KEY = 'continent.homeSeen.v1';

export function readFirstVisit(storage, search, hash) {
  if (search || hash) return false;
  try {
    return storage.getItem(HOME_SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markHomeSeen(storage) {
  try { storage.setItem(HOME_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}
