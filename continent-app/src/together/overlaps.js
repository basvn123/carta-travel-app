/**
 * overlaps.js, "Plans that meet" (T929): where a friend's shown plan and one
 * of your own dated trips are in the same city on the same days.
 *
 * Computed here, in the browser, from two lists the app already holds: your
 * own trip plans (per-stop dates) and the trips friends chose to show you
 * (list_friend_trips, with per-stop dates from list_friend_shares once 056 is
 * applied). Nothing is sent anywhere and nothing reads a location: an overlap
 * is two PLANS, never presence (see friendFacts.js).
 *
 * Rules, each one a test in tests/togetherOverlaps.test.mjs:
 *   - city level: the same catalogue destination id, or, where a stop has no
 *     id, the same city name;
 *   - the same dates: the two stays share at least one calendar day (an
 *     arrival on the day the other leaves counts, both are in town);
 *   - only friends whose "Plans that meet" is on, and only when yours is;
 *   - nothing that has already ended;
 *   - a friend's multi-city trip without per-stop dates is skipped rather
 *     than guessed (its window covers every city, so it would claim days).
 */

const DAY = 86400000;

function isIso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function dayNum(iso) { return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY); }
function isoOf(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
const norm = (s) => String(s || '').trim().toLowerCase();

/** The stays in one of your own trip plans: [{ destId, city, start, end }]. */
export function myWindows(plan) {
  const stops = Array.isArray(plan?.stops) ? plan.stops : [];
  const out = [];
  for (const s of stops) {
    const start = s.arrive_date || s.arriveDate;
    const end = s.depart_date || s.departDate;
    if (!isIso(start) || !isIso(end) || end < start) continue;
    out.push({ destId: s.destination_id || s.destinationId || null, city: s.city || '', start, end });
  }
  return out;
}

/**
 * The stays in a friend's shown trip. Per-stop dates come from the shares
 * projection (056); without them a one-city trip's window is that city's
 * stay, and a several-city trip gives nothing.
 */
export function friendWindows(trip, stops = null) {
  if (Array.isArray(stops) && stops.length) {
    return myWindows({ stops });
  }
  const ids = trip?.destinationIds || [];
  const cities = trip?.cities || [];
  if (ids.length > 1 || cities.length > 1) return [];
  if (!isIso(trip?.startDate) || !isIso(trip?.endDate) || trip.endDate < trip.startDate) return [];
  return [{ destId: ids[0] || null, city: cities[0] || '', start: trip.startDate, end: trip.endDate }];
}

function samePlace(a, b) {
  if (a.destId && b.destId) return a.destId === b.destId;
  return Boolean(norm(a.city)) && norm(a.city) === norm(b.city);
}

/** A stable key for one overlap, so Hide can remember it. */
export function overlapKey(o) {
  return `${o.friendId}:${o.theirs.tripPlanId}:${o.destId || norm(o.city)}:${o.mine.start}`;
}

/**
 * Every overlap, soonest first.
 *   myPlans      your trip plans (fetchTripPlans shape: id, label, stops)
 *   friendTrips  list_friend_trips rows (ownerId, tripPlanId, ...)
 *   stopsByTrip  Map tripPlanId -> stops with dates (from the shares), or null
 *   meetOn       your own "Plans that meet" switch
 *   friendMeet   (ownerId) => boolean, the friend's switch (default true)
 *   friendIds    Set of accepted friends' ids; anyone else is ignored
 *   today        ISO day; stays that ended before it are left out
 *   hidden       Set of overlap keys the traveller hid
 */
export function computeOverlaps({
  myPlans = [], friendTrips = [], stopsByTrip = null, meetOn = true,
  friendMeet = () => true, friendIds = null, today = new Date().toISOString().slice(0, 10), hidden = null,
} = {}) {
  if (!meetOn) return [];
  const mine = [];
  for (const p of myPlans || []) {
    for (const w of myWindows(p)) {
      if (w.end >= today) mine.push({ ...w, planId: p.id, label: p.label || '' });
    }
  }
  if (!mine.length) return [];
  const out = [];
  const seen = new Set();
  for (const tr of friendTrips || []) {
    if (!tr?.ownerId) continue;
    if (friendIds && !friendIds.has(tr.ownerId)) continue;
    if (!friendMeet(tr.ownerId)) continue;
    const stops = stopsByTrip && typeof stopsByTrip.get === 'function' ? stopsByTrip.get(tr.tripPlanId) : null;
    for (const fw of friendWindows(tr, stops)) {
      if (fw.end < today) continue;
      for (const mw of mine) {
        if (!samePlace(mw, fw)) continue;
        const start = mw.start > fw.start ? mw.start : fw.start;
        const end = mw.end < fw.end ? mw.end : fw.end;
        if (start > end) continue;
        const o = {
          friendId: tr.ownerId,
          friendName: tr.ownerName || `@${tr.ownerHandle || ''}`,
          handle: tr.ownerHandle || '',
          emoji: tr.ownerEmoji || '',
          destId: mw.destId || fw.destId || null,
          city: mw.city || fw.city || '',
          start,
          end,
          mine: { planId: mw.planId, label: mw.label, start: mw.start, end: mw.end },
          theirs: { tripPlanId: tr.tripPlanId, label: tr.label || '', start: fw.start, end: fw.end },
        };
        o.key = overlapKey(o);
        if (seen.has(o.key) || (hidden && hidden.has(o.key))) continue;
        seen.add(o.key);
        out.push(o);
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.friendName.localeCompare(b.friendName));
}

/**
 * The two date lanes of the meet card, as percentages of one shared scale:
 * the days from the earlier start to the later end, one column a day.
 *   { days: [iso], you: { left, width }, them: { left, width }, over: { left, width } }
 */
export function laneGeometry(o) {
  const a = dayNum(o.mine.start < o.theirs.start ? o.mine.start : o.theirs.start);
  const b = dayNum(o.mine.end > o.theirs.end ? o.mine.end : o.theirs.end);
  const n = Math.max(1, b - a + 1);
  const span = (s, e) => {
    const left = ((dayNum(s) - a) / n) * 100;
    const width = ((dayNum(e) - dayNum(s) + 1) / n) * 100;
    return { left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100 };
  };
  const days = [];
  for (let d = a; d <= b; d += 1) days.push(isoOf(d));
  return { days, you: span(o.mine.start, o.mine.end), them: span(o.theirs.start, o.theirs.end), over: span(o.start, o.end) };
}

/* ---- Hide, remembered on this device ---- */

export const HIDDEN_KEY = 'carta.together.hiddenMeets';

export function readHidden() {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}

export function hideOverlap(key) {
  const s = readHidden();
  s.add(key);
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s].slice(-200))); } catch { /* private mode */ }
  return s;
}

/**
 * Friends' shown stays in one window (the Plan date step): each friend stay
 * at a named place that shares a day with [start, end]. With no window, the
 * soonest upcoming stays. At most `max`.
 */
export function friendStaysIn({ friendTrips = [], stopsByTrip = null, start = null, end = null, today, max = 2 } = {}) {
  const now = today || new Date().toISOString().slice(0, 10);
  const out = [];
  for (const tr of friendTrips || []) {
    const stops = stopsByTrip && typeof stopsByTrip.get === 'function' ? stopsByTrip.get(tr.tripPlanId) : null;
    for (const w of friendWindows(tr, stops)) {
      if (w.end < now) continue;
      if (start && end && (w.end < start || w.start > end)) continue;
      out.push({ ...w, friendId: tr.ownerId, friendName: tr.ownerName || `@${tr.ownerHandle || ''}`, emoji: tr.ownerEmoji || '', tripPlanId: tr.tripPlanId });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, max);
}
