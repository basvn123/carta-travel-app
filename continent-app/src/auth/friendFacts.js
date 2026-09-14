/**
 * friendFacts.js, turning a friend's shown trips into one line of fact.
 *
 * The friends page used to be an address book: a row per person, a name, a
 * Remove button. Nothing in it said what anybody was doing, so the only way
 * to learn anything was to open something. This module is what lets a row be
 * informative before it is expanded.
 *
 * The line it produces is a PLAN, never a STATE. "Ghent, 3 to 9 September" is
 * something a friend chose to show and something you can act on. "Currently in
 * Ghent" is a different product: it would need continuous location, it would
 * make being unavailable visible, and it would hand back the coarse version of
 * the home address that migration 011 goes to some trouble to strip. So there
 * is no presence here, no online dot and no last-seen. A friend appears to be
 * doing something exactly when they have published a trip that says so.
 *
 * Everything is derived from the list the spoke has already fetched
 * (list_friend_trips), so a richer row costs no extra query.
 */

/** ISO day for "now", so callers can pin it in tests. */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * A trip's window as one phrase: "3 to 9 September", or "28 September to 4
 * October" when it crosses a month.
 *
 * Intl.formatRange already knows that English says September 3 and Dutch says
 * 3 september, and that a range inside one month says the month once. What it
 * does NOT do is respect this app's rule against en dashes, so the separator
 * it produces is swapped for a word the caller passes in from the catalogue.
 * Doing it by hand instead would mean reimplementing that whole table in six
 * languages and getting it wrong.
 */
export function fmtWindow(startIso, endIso, lang, joiner = 'to') {
  if (!startIso) return '';
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return '';
  const fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' });
  const end = endIso ? new Date(endIso) : null;
  if (!end || Number.isNaN(end.getTime()) || +end === +start) return fmt.format(start);
  // Only the dash formatRange itself inserts, spaced or tight, is replaced. A
  // broader sweep would eat the hyphen inside a hyphenated month name.
  return fmt.formatRange(start, end).replace(/\s*[–—]\s*/g, ` ${joiner} `);
}

/** Where a trip is, in as few words as carry the point: one city, or the
 *  first city and how many more. */
export function fmtWhere(cities) {
  const list = (cities || []).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list[0]} +${list.length - 1}`;
}

/**
 * What one friend is doing, from the trips they are showing you.
 *
 * `next` is the soonest trip that has not finished, because a trip you can
 * still join is the only one worth putting on the row. When every shown trip
 * is over, there is no next and the row falls back to the count, which is
 * still true and still useful.
 */
export function friendFacts(trips, friendUserId, today = todayIso()) {
  const mine = (trips || []).filter((tr) => tr.ownerId === friendUserId);
  if (mine.length === 0) return { shown: 0, next: null };
  const upcoming = mine
    .filter((tr) => tr.endDate && tr.endDate >= today)
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
  return { shown: mine.length, next: upcoming[0] || null };
}

/**
 * How long ago something changed, in whole units, as a string the caller can
 * put after a name. Intl does the language; this only picks the unit.
 *
 * Anything under a minute reads as "now" rather than "0 seconds ago", and
 * anything older than four weeks is not worth a relative phrase at all, so it
 * returns null and the caller says nothing.
 */
export function since(iso, lang, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const secs = Math.round((then.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(secs);
  if (abs > 60 * 60 * 24 * 28) return null;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const units = [
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (abs >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return rtf.format(0, 'minute');
}

/**
 * The trips a friend has shown, most recently changed first, so the shelf
 * reads as a change log rather than as a static list.
 *
 * A trip counts as NEW when it changed after the last time this page was
 * looked at. That mark is the whole of the "what happened since I was here"
 * idea: no feed, no counter, no metric anybody has to defend, just the rows
 * that moved. A trip with no timestamp (an older list_friend_trips that does
 * not return one) is never marked, because guessing would be worse.
 */
export function withRecency(trips, lastSeenIso) {
  return (trips || [])
    .map((tr) => ({
      ...tr,
      isNew: Boolean(lastSeenIso && tr.updatedAt && tr.updatedAt > lastSeenIso),
    }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/** Where the last visit is remembered. Per browser, never sent anywhere: it
 *  answers "what is new to me", which is nobody else's business. */
export const LAST_SEEN_KEY = 'carta.friends.lastSeen';

export function readLastSeen() {
  try { return localStorage.getItem(LAST_SEEN_KEY) || ''; } catch { return ''; }
}

export function writeLastSeen(iso = new Date().toISOString()) {
  try { localStorage.setItem(LAST_SEEN_KEY, iso); } catch { /* private mode */ }
}
