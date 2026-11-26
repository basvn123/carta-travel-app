/**
 * doorGroup.js, the Plan door's Friends card (G12 follow-up, deferred from
 * the plan rethink's B7b). Pure: it reads the Together store's rows that
 * Vrienden already loaded (the header door loads them at start), so the
 * door adds no network call.
 *
 * A group counts only when the traveller has joined it and something is in
 * play: a leading place or dates that have not passed. A booked group trip
 * is done, so it is left out. The card shows the most recently active one;
 * the rest stay behind "All groups" in Vrienden.
 *
 *   doorGroups({ groups, circles, destinations, today })
 *     -> [{ kind, id, title, at, group, place }] newest activity first
 *   group   what friendsSeed reads ({ id, title, members, band, kind })
 *   place   what planGroupTrip passes on ({ destId, iso2, name, start, end })
 */
import { tally, leader } from '../../together/groupBand.js';
import { rankProposals } from '../circles/rank.js';
import { bestWindow } from '../circles/window.js';

const time = (v) => {
  const n = Date.parse(v || '');
  return Number.isFinite(n) ? n : 0;
};

// A window that has ended is history, not a plan (G12: "dates in play").
const live = (w, today) => (w?.start && w?.end && w.end >= today ? { start: w.start, end: w.end } : null);

function placeOf(destId, destinations) {
  if (!destId) return null;
  const d = destinations?.[destId];
  return { destId: String(destId), iso2: d?.iso2 || '', name: d?.city || d?.name || '' };
}

function fromGroupTrip(g, destinations, today) {
  if (g?.myStatus !== 'joined' || g.bookedPlanId) return null;
  const opts = g.options || [];
  // Vrienden's own rule (GroupTrips.jsx): most votes leads; no votes, no leader.
  const where = leader(tally(opts.filter((o) => o.kind === 'where'), g.votes));
  const when = live(leader(tally(opts.filter((o) => o.kind === 'when'), g.votes)), today);
  const place = placeOf(where?.destId, destinations);
  if (!place && !when) return null;
  return {
    kind: 'group',
    id: g.id,
    title: g.title || '',
    at: Math.max(time(g.createdAt), ...opts.map((o) => time(o.at))),
    group: { id: g.id, title: g.title || '', members: g.members || [], band: g.band || null },
    place: { ...(place || {}), ...(when || {}) },
  };
}

function fromCircle(c, destinations, today) {
  if (c?.myStatus !== 'joined') return null;
  const joined = (c.members || []).filter((m) => m.status === 'joined').map((m) => m.userId);
  // As CircleView: the top proposal leads only with a positive score.
  const top = rankProposals(c.proposals, c.votes)[0] || null;
  const place = top && top.score > 0 ? placeOf(top.destId, destinations) : null;
  const when = live(bestWindow(c.availability, joined, { minNights: 1 }), today);
  if (!place && !when) return null;
  return {
    kind: 'circle',
    id: c.id,
    title: c.name || '',
    at: Math.max(time(c.createdAt), ...(c.proposals || []).map((p) => time(p.created_at))),
    group: { id: c.id, title: c.name || '', members: c.members || [], band: null, kind: 'circle' },
    place: { ...(place || {}), ...(when || {}) },
  };
}

export function doorGroups({ groups = [], circles = [], destinations = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const out = [
    ...(groups || []).map((g) => fromGroupTrip(g, destinations, today)),
    ...(circles || []).map((c) => fromCircle(c, destinations, today)),
  ].filter(Boolean);
  // Stable sort: equal activity keeps the store's order (newest created first).
  return out.sort((a, b) => b.at - a.at);
}
