/**
 * timeline.js, the Vrienden page as one timeline (G16, decision 0017,
 * version 3). Pure: no React, no storage, no network, so the rules are tested
 * in tests/vriendenTimeline.test.mjs and the example (exampleTimeline) runs
 * through the same code as the real page.
 *
 *   waitingOf(s, today)        what waits on you, the Nu band's rows
 *   balancesOf(ledgers, me)    per person, what you get (+) or owe (-)
 *   buildTimeline(input, today) the bands: Nu, then each month, then Zonder
 *                              datum; each fact once, merged and capped
 *   stripOf(s, today)          the face strip: friends by soonest trip, then
 *                              people you asked, then kringen
 *   exampleTimeline(catalogue, today, words)  the example, from real places
 *
 * The rules, each one a test:
 *   - one fact once: an overlap replaces the friend's trip and absorbs your
 *     own plan on those days; a kring or group trip that waits on you sits
 *     in Nu and not on the line;
 *   - moments at the same place on overlapping days merge into one card
 *     with stacked faces;
 *   - Nu shows 3, a month 4, the rest behind "Alle n" and "Nog n in maand";
 *   - from the third band on, row scale;
 *   - saffron on the soonest overlap only.
 */
import { rankProposals } from '../../lib/circles/rank.js';
import { bestWindow } from '../../lib/circles/window.js';
import { tally, leader, owesVote } from '../groupBand.js';
import { settleUp } from '../settle.js';

export const NOW_CAP = 3;
export const BAND_CAP = 4;
export const STRIP_CAP = 8;

const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const nameOfLink = (l) => l.displayName || (l.handle ? `@${l.handle}` : '');

/* ---------------------------------------------------------- Nu */

function unvoted(c, me) {
  const mine = new Set((c.votes || []).filter((v) => v.user_id === me).map((v) => v.proposal_id));
  return (c.proposals || []).filter((p) => !mine.has(p.id)).length;
}

/** Per person: + they owe you, - you owe them, in cents, with a group to settle in. */
export function balancesOf(ledgers, me) {
  const by = new Map();
  for (const [gid, l] of Object.entries(ledgers || {})) {
    if (!l || l.missing) continue;
    let transfers = [];
    try { transfers = settleUp(l.expenses, l.settlements).transfers; } catch { transfers = []; }
    for (const tr of transfers) {
      const other = tr.to === me ? tr.from : tr.from === me ? tr.to : null;
      if (!other) continue;
      const cur = by.get(other) || { cents: 0, groupId: gid };
      cur.cents += tr.to === me ? tr.amountCents : -tr.amountCents;
      by.set(other, cur);
    }
  }
  return [...by.entries()].filter(([, v]) => v.cents !== 0)
    .map(([id, v]) => ({ id, cents: v.cents, groupId: v.groupId }))
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

function personIn(s, id) {
  const l = (s.links || []).find((x) => x.userId === id);
  if (l) return { id, name: nameOfLink(l), emoji: l.avatarEmoji || '' };
  for (const g of s.groups || []) {
    const m = g.members.find((x) => x.userId === id);
    if (m) return { id, name: m.name || '', emoji: m.emoji || '' };
  }
  return { id, name: '', emoji: '' };
}

/**
 * The rows that wait on you, in the order they are answered: friend
 * requests, asks to join your trips, co-plan invites, group and kring
 * invites and votes, then balances. `subject` names the group or kring a
 * row is about, so the line does not show it a second time.
 */
export function waitingOf(s) {
  const me = s.userId;
  const out = [];
  for (const l of (s.links || []).filter((x) => x.kind === 'incoming')) {
    out.push({ id: `f:${l.id}`, kind: 'request', linkId: l.id, person: { id: l.userId, name: nameOfLink(l), emoji: l.avatarEmoji || '' } });
  }
  for (const r of s.joinToMe || []) {
    const plan = (s.myPlans || []).find((p) => p.id === r.tripPlanId) || null;
    out.push({ id: `j:${r.id}`, kind: 'join', requestId: r.id, plan, label: r.label || '', person: { id: r.requesterId, name: r.name || '', emoji: r.emoji || '' } });
  }
  for (const iv of s.invites || []) {
    out.push({ id: `c:${iv.tripPlanId}`, kind: 'coplanInvite', invite: iv, person: { id: `owner:${iv.ownerHandle || ''}`, name: iv.ownerName || `@${iv.ownerHandle || ''}`, emoji: '' } });
  }
  for (const g of s.groups || []) {
    const owner = g.members.find((m) => m.userId === g.ownerId);
    const person = { id: g.ownerId, name: owner?.name || '', emoji: owner?.emoji || '' };
    if (g.myStatus === 'invited') out.push({ id: `g:${g.id}`, kind: 'groupInvite', subject: `g:${g.id}`, group: g, person });
    else if (g.myStatus === 'joined' && !g.bookedPlanId
      && (owesVote(g.options, g.votes, me, 'when') || owesVote(g.options, g.votes, me, 'where'))) {
      out.push({ id: `g:${g.id}`, kind: 'groupVote', subject: `g:${g.id}`, group: g, person });
    }
  }
  for (const c of s.circles || []) {
    const owner = c.members.find((m) => m.userId === c.ownerId);
    const person = { id: c.ownerId, name: owner?.name || '', emoji: owner?.emoji || '' };
    if (c.myStatus === 'invited') out.push({ id: `k:${c.id}`, kind: 'circleInvite', subject: `k:${c.id}`, circle: c, person });
    else if (c.myStatus === 'joined' && unvoted(c, me) > 0) {
      out.push({ id: `k:${c.id}`, kind: 'circleVote', subject: `k:${c.id}`, circle: c, n: unvoted(c, me), person });
    }
  }
  for (const b of balancesOf(s.ledgers, me)) {
    out.push({ id: `b:${b.id}`, kind: 'balance', cents: b.cents, groupId: b.groupId, person: personIn(s, b.id) });
  }
  return out;
}

/* ---------------------------------------------------------- the line */

const PRIORITY = { overlap: 4, coplan: 3, friendTrip: 2, myTrip: 1 };
const MERGES = new Set(Object.keys(PRIORITY));

function addPeople(into, people) {
  for (const p of people) if (p && !into.some((x) => x.id === p.id)) into.push(p);
}

function momentsOf({ friendTrips = [], myPlans = [], overlaps = [], circles = [], groupTrips = [], sharedLists = [], coplans = {}, me }, today, waitingSubjects) {
  const out = [];
  const coveredTrips = new Set(overlaps.map((o) => o.theirs?.tripPlanId).filter(Boolean));
  const coveredPlans = new Map();
  overlaps.forEach((o, i) => {
    const people = [{ id: o.friendId, name: o.friendName || '', emoji: o.emoji || '' }];
    const pid = o.mine?.planId;
    if (pid) {
      addPeople(people, coplans[pid] || []);
      if (!coveredPlans.has(pid)) coveredPlans.set(pid, i);
    }
    out.push({
      id: `ov:${o.key}`, kind: 'overlap', start: o.start, end: o.end, placeIds: [o.destId].filter(Boolean),
      city: o.city || '', people, withYou: true, src: o, merged: pid ? [`my:${pid}`] : [],
    });
  });
  for (const tr of friendTrips) {
    if (coveredTrips.has(tr.tripPlanId)) continue;
    const end = isIso(tr.endDate) ? tr.endDate : tr.startDate;
    if (!isIso(tr.startDate) || end < today) continue;
    out.push({
      id: `ft:${tr.tripPlanId}`, kind: 'friendTrip', start: tr.startDate, end, placeIds: tr.destinationIds || [],
      city: (tr.cities || [])[0] || '', people: [{ id: tr.ownerId, name: tr.ownerName || `@${tr.ownerHandle || ''}`, emoji: tr.ownerEmoji || '' }],
      withYou: false, src: tr, merged: [],
    });
  }
  for (const p of myPlans) {
    if (coveredPlans.has(p.id)) continue;
    const co = coplans[p.id] || [];
    const dated = isIso(p.start_date);
    const end = isIso(p.end_date) ? p.end_date : p.start_date;
    if (dated && end < today) continue;
    // Your own undated plan lives in My trips; with co-planners it is shared, so it stays.
    if (!dated && !co.length) continue;
    out.push({
      id: co.length ? `cp:${p.id}` : `my:${p.id}`, kind: co.length ? 'coplan' : 'myTrip',
      start: dated ? p.start_date : null, end: dated ? end : null, placeIds: p.destination_ids || [],
      city: (p.cities || [])[0] || '', people: [...co], withYou: true, src: p, merged: [],
    });
  }
  for (const c of circles) {
    if (c.myStatus !== 'joined' || waitingSubjects.has(`k:${c.id}`)) continue;
    const joined = c.members.filter((m) => m.status === 'joined');
    const lead = rankProposals(c.proposals || [], c.votes || [])[0] || null;
    const win = bestWindow(c.availability || [], joined.map((m) => m.userId));
    const dated = win && win.end >= today;
    out.push({
      id: `k:${c.id}`, kind: 'circle', start: dated ? win.start : null, end: dated ? win.end : null,
      placeIds: lead ? [lead.destId] : [], city: '',
      people: joined.filter((m) => m.userId !== me).map((m) => ({ id: m.userId, name: m.name || '', emoji: m.emoji || '' })),
      withYou: true, src: c, lead, window: dated ? win : null, merged: [],
    });
  }
  for (const g of groupTrips) {
    if (g.myStatus !== 'joined' || waitingSubjects.has(`g:${g.id}`)) continue;
    const when = leader(tally((g.options || []).filter((o) => o.kind === 'when'), g.votes, me));
    const where = leader(tally((g.options || []).filter((o) => o.kind === 'where'), g.votes, me));
    const dated = when && isIso(when.start) && (when.end || when.start) >= today;
    out.push({
      id: `g:${g.id}`, kind: 'group', start: dated ? when.start : null, end: dated ? when.end || when.start : null,
      placeIds: where?.destId ? [where.destId] : [], city: '',
      people: g.members.filter((m) => m.userId !== me).map((m) => ({ id: m.userId, name: m.name || '', emoji: m.emoji || '' })),
      withYou: true, src: g, merged: [],
    });
  }
  for (const l of sharedLists) {
    const people = (l.members || l.people || []).filter((p) => (p.id || p.userId) !== me)
      .map((p) => ({ id: p.id || p.userId, name: p.name || p.displayName || '', emoji: p.emoji || '' }));
    out.push({
      id: `l:${l.id}`, kind: 'list', start: null, end: null,
      // A saved list's items are keyed 'dest:OPO'; only places give a photo.
      placeIds: (l.items || []).map((x) => (typeof x === 'string' ? x
        : String(x?.key || '').startsWith('dest:') ? x.key.slice(5) : x?.destId || null)).filter(Boolean),
      city: '', people, withYou: true, src: l, merged: [],
    });
  }
  return out;
}

/** Same place (a shared catalogue id) and at least one shared day. */
function sameMoment(a, b) {
  if (!a.start || !b.start) return false;
  if (!a.placeIds.some((id) => b.placeIds.includes(id))) return false;
  return a.start <= b.end && b.start <= a.end;
}

/** Merge moments at one place on overlapping days into the richest one. */
export function mergeSamePlace(moments) {
  const sorted = [...moments].sort((a, b) => (PRIORITY[b.kind] || 0) - (PRIORITY[a.kind] || 0));
  const kept = [];
  for (const m of sorted) {
    const host = MERGES.has(m.kind) ? kept.find((k) => MERGES.has(k.kind) && sameMoment(k, m)) : null;
    if (!host) { kept.push({ ...m, people: [...m.people], merged: [...m.merged] }); continue; }
    addPeople(host.people, m.people);
    host.withYou = host.withYou || m.withYou;
    host.merged.push(m.id, ...m.merged);
  }
  return kept;
}

const monthOf = (iso) => iso.slice(0, 7);

/**
 * input: { friendTrips, myPlans, overlaps, waiting, circles, groupTrips,
 *          sharedLists, coplans, me }
 * Returns { now, nowShown, bands: [{ key, month, thisMonth, moments,
 * hidden, scale }], undated, next, count }.
 */
export function buildTimeline(input, today) {
  const waiting = input.waiting || [];
  const subjects = new Set(waiting.map((w) => w.subject).filter(Boolean));
  const all = mergeSamePlace(momentsOf(input, today, subjects));
  const dated = all.filter((m) => m.start).map((m) => ({ ...m, at: m.start < today ? today : m.start }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const firstOverlap = dated.find((m) => m.kind === 'overlap');
  for (const m of dated) m.saffron = m === firstOverlap;
  const byMonth = new Map();
  for (const m of dated) {
    const k = monthOf(m.at);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(m);
  }
  const lead = waiting.length ? 1 : 0;
  const bands = [...byMonth.entries()].map(([month, ms], i) => ({
    key: month, month, thisMonth: month === monthOf(today),
    moments: ms.slice(0, BAND_CAP), hidden: ms.slice(BAND_CAP),
    scale: i + lead >= 2 ? 'row' : 'full',
  }));
  const undated = all.filter((m) => !m.start).map((m) => ({ ...m, saffron: false }));
  const next = dated.find((m) => m.people.length > 0) || null;
  return { now: waiting, nowShown: waiting.slice(0, NOW_CAP), bands, undated, next, count: waiting.length };
}

/* ---------------------------------------------------------- the strip */

/**
 * Friends by their soonest next trip (none last, then by name), people you
 * asked ("Gevraagd"), then kringen you are in.
 */
export function stripOf(s, today) {
  const nextOf = new Map();
  for (const tr of s.friendTrips || []) {
    const end = isIso(tr.endDate) ? tr.endDate : tr.startDate;
    if (!isIso(tr.startDate) || end < today) continue;
    const cur = nextOf.get(tr.ownerId);
    if (!cur || tr.startDate < cur.startDate) nextOf.set(tr.ownerId, tr);
  }
  const friends = (s.links || []).filter((l) => l.kind === 'friend').map((l) => ({
    kind: 'friend', id: l.userId, linkId: l.id, name: nameOfLink(l), emoji: l.avatarEmoji || '', next: nextOf.get(l.userId) || null,
  })).sort((a, b) => {
    if (a.next && b.next) return a.next.startDate.localeCompare(b.next.startDate) || a.name.localeCompare(b.name);
    if (a.next || b.next) return a.next ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const pending = (s.links || []).filter((l) => l.kind === 'outgoing')
    .map((l) => ({ kind: 'pending', id: l.userId, linkId: l.id, name: nameOfLink(l), emoji: l.avatarEmoji || '' }));
  const circles = (s.circles || []).filter((c) => c.myStatus === 'joined')
    .map((c) => ({ kind: 'circle', id: c.id, name: c.name, circle: c }));
  return [...friends, ...pending, ...circles];
}

/* ---------------------------------------------------------- the example */

// Places a European traveller knows, tried first; any catalogue place with a
// photo fills in when the catalogue lacks one.
const EXAMPLE_PLACES = ['LIS', 'NAP', 'SPU', 'INN', 'OPO', 'LJU', 'FLR', 'BCN', 'SVQ', 'PRG'];
export const EXAMPLE_ME = 'ex-me';
// Neutral first names; the bar over the page says Voorbeeld.
const EXAMPLE_PEOPLE = [
  { id: 'ex-alex', name: 'Alex' }, { id: 'ex-kim', name: 'Kim' }, { id: 'ex-noa', name: 'Noa' }, { id: 'ex-robin', name: 'Robin' },
];
// The one figure with no source: what Kim owes you in the example (cents).
export const EXAMPLE_BALANCE_CENTS = 4300;

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The example Vrienden page: real catalogue places with photos, dates
 * counted from today, example people. Returns the same shape the page reads
 * from the store (links, friendTrips, myPlans, overlaps, waiting, circles,
 * groupTrips, sharedLists, coplans, userId, me). Pure: it reads nothing but
 * its arguments and writes nothing.
 *   words  { circle, list }  the kring's and the list's names in the reader's language
 */
export function exampleTimeline(catalogue, today, words = {}) {
  const has = (id) => Boolean(catalogue?.[id]?.image?.url);
  const picked = EXAMPLE_PLACES.filter(has);
  if (picked.length < 5) {
    for (const id of Object.keys(catalogue || {}).sort()) {
      if (picked.length >= 5) break;
      if (has(id) && !picked.includes(id)) picked.push(id);
    }
  }
  const P = (i) => picked[i % Math.max(1, picked.length)] || null;
  const city = (id) => catalogue?.[id]?.city || catalogue?.[id]?.name || '';
  const [alex, kim, noa, robin] = EXAMPLE_PEOPLE;
  const d = (n) => addDays(today, n);
  const link = (p, kind) => ({ id: `l-${p.id}`, kind, userId: p.id, handle: '', displayName: p.name, avatarEmoji: '', example: true });
  const trip = (p, id, place, a, b) => ({
    ownerId: p.id, ownerHandle: '', ownerName: p.name, ownerEmoji: '', tripPlanId: id, label: '',
    startDate: d(a), endDate: d(b), cities: [city(place)], countries: [], destinationIds: place ? [place] : [], example: true,
  });
  const friendTrips = [
    trip(alex, 'ex-ft-alex', P(0), 18, 22),
    trip(kim, 'ex-ft-kim', P(1), 34, 39),
    trip(noa, 'ex-ft-noa', P(2), 64, 70),
    trip(alex, 'ex-ft-alex2', P(3), 120, 126),
  ];
  const mine = { id: 'ex-mine', label: '', user_id: EXAMPLE_ME, cities: [city(P(0))], countries: [], start_date: d(17), end_date: d(23),
    destination_ids: P(0) ? [P(0)] : [], stops: [{ destination_id: P(0), city: city(P(0)), arrive_date: d(17), depart_date: d(23) }], example: true };
  const overlap = {
    friendId: alex.id, friendName: alex.name, handle: '', emoji: '', destId: P(0), city: city(P(0)), start: d(18), end: d(22),
    mine: { planId: mine.id, label: '', start: d(17), end: d(23) }, theirs: { tripPlanId: 'ex-ft-alex', label: '', start: d(18), end: d(22) },
    key: `ex:${P(0)}:${d(18)}`, example: true,
  };
  const member = (p) => ({ userId: p.id, status: 'joined', handle: '', name: p.name, emoji: '' });
  const circle = {
    id: 'ex-circle', name: words.circle || '', ownerId: alex.id, myStatus: 'joined', createdAt: `${d(-20)}T10:00:00Z`, example: true,
    members: [member({ id: EXAMPLE_ME, name: '' }), member(alex), member(kim), member(noa)],
    proposals: [P(4), P(1), P(2)].filter(Boolean).map((id, i) => ({ id: `ex-p${i}`, destId: id, createdBy: alex.id, created_at: `${d(-19 + i)}T10:00:00Z` })),
    votes: [
      { proposal_id: 'ex-p0', user_id: EXAMPLE_ME, value: 1 }, { proposal_id: 'ex-p0', user_id: alex.id, value: 1 },
      { proposal_id: 'ex-p0', user_id: kim.id, value: 1 }, { proposal_id: 'ex-p1', user_id: EXAMPLE_ME, value: 1 },
      { proposal_id: 'ex-p1', user_id: noa.id, value: 1 }, { proposal_id: 'ex-p2', user_id: EXAMPLE_ME, value: -1 },
    ],
    availability: [],
  };
  const sharedLists = [{ id: 'ex-list', name: words.list || '', items: [P(3), P(2), P(4)].filter(Boolean), members: [{ id: kim.id, name: kim.name }], example: true }];
  const links = [link(alex, 'friend'), link(kim, 'friend'), link(noa, 'friend'), link(robin, 'incoming')];
  const waiting = [
    { id: `f:l-${robin.id}`, kind: 'request', linkId: `l-${robin.id}`, person: { id: robin.id, name: robin.name, emoji: '' }, example: true },
    { id: `b:${kim.id}`, kind: 'balance', cents: EXAMPLE_BALANCE_CENTS, groupId: '', person: { id: kim.id, name: kim.name, emoji: '' }, example: true },
  ];
  return {
    userId: EXAMPLE_ME, me: { handle: '', displayName: '', avatarEmoji: '' }, example: true,
    links, friendTrips, myPlans: [mine], overlaps: [overlap], waiting, circles: [circle], groupTrips: [], sharedLists, coplans: {}, places: picked,
  };
}
