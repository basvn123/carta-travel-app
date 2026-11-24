/**
 * useTogether.js, everything the Together page and its signals read, loaded
 * once per signed-in account and shared (T928 to T932).
 *
 * The header door needs the count of things waiting on you, the page needs
 * the people, their shown plans and the group trips, and the signals across
 * Carta (Explore cards, the place page, the Plan date step, My trips) need
 * the plans and what each friend shares. One store answers all of them, so a
 * place page opened ten times does not ask ten times. Every read settles to
 * an empty answer on failure: a surface about somebody else's plans says
 * nothing rather than show an error.
 *
 * The count is only for things waiting on YOU: friend requests, co-plan and
 * group invitations, requests to join your trips (T939), and group
 * questions you have not voted on. Nothing a
 * friend merely did is counted.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  fetchFriendLinks, sendFriendRequest, acceptFriendRequest, removeFriendLink, listFriendTrips,
} from '../auth/friends.js';
import { refreshFriendTrips } from '../auth/useFriendTrips.js';
import { fetchMyProfile } from '../auth/profiles.js';
import { listCoplanInvites, acceptCoplanInvite, removeCoplanner, inviteCoplanner } from '../auth/coplanners.js';
import { fetchTripPlans } from '../auth/tripPlanStorage.js';
import {
  DEFAULT_VISIBILITY, fetchMyVisibility, saveMyVisibility, listFriendShares, blockFriendLink,
} from '../auth/friendVisibility.js';
import {
  listGroupTrips, createGroupTrip, respondGroupInvite, addGroupOption, castGroupVote, setGroupBudget, bookGroupTrip,
} from '../auth/groupTrips.js';
import { listJoinRequests, askToJoin, answerJoinRequest } from '../auth/joinRequests.js';
import {
  fetchGroupLedger, addGroupExpense, deleteGroupExpense, markTransferPaid, deleteSettlement,
  fetchMyPayLink, saveMyPayLink,
} from '../auth/groupExpenses.js';
import {
  listCircles, createCircle, respondCircleInvite, addProposal, deleteProposal, castCircleVote,
  setMyAvailability, setMyHomeAirport, makeCircleTrip,
} from '../auth/circles.js';
import { mockCircles } from './circle/circleMock.js';
import { bandTopFrom } from './groupBand.js';
import { waitingOf } from './home/timeline.js';
import { readHidden, hideOverlap } from './overlaps.js';
import { IS_FRIENDS_MOCK, FRIENDS_MOCK, MOCK_ME, mockState } from './friendsMock.js';

const EMPTY = Object.freeze({
  userId: null,
  loaded: false,
  me: null,
  links: [],
  friendTrips: [],
  shares: new Map(),
  myPlans: [],
  invites: [],
  groups: [],
  groupsMissing: true,
  visibility: { ...DEFAULT_VISIBILITY },
  visibilityMissing: true,
  coplannersByPlan: {},
  hidden: new Set(),
  // Ask to join (T939, 057): requests to your trips, and the trips you asked.
  joinToMe: [],
  joinMine: new Set(),
  joinMissing: true,
  // Settle up (T940, 058): each group's ledger once opened, and your own
  // payment link.
  ledgers: {},
  payLink: '',
  payLinkMissing: true,
  // Kringen (G16, 078): lasting groups that propose and vote on trips.
  circles: [],
  circlesMissing: true,
});

let state = EMPTY;
let loadingFor = null;
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach((fn) => fn());
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => state;

const settle = (p, fallback) => Promise.resolve().then(() => p).catch(() => fallback);

async function load(userId) {
  if (IS_FRIENDS_MOCK) {
    const base = mockState();
    const none = !base.links.some((l) => l.kind === 'friend') || base.links.length < 2;
    emit({ ...EMPTY, ...base, circles: none ? [] : mockCircles(), circlesMissing: false, userId: MOCK_ME, loaded: true, hidden: readHidden() });
    return;
  }
  loadingFor = userId;
  const [links, friendTrips, shares, invites, groupsRes, myPlans, vis, me, join, pay, circlesRes] = await Promise.all([
    settle(fetchFriendLinks(userId), []),
    settle(listFriendTrips(), []),
    settle(listFriendShares(), new Map()),
    settle(listCoplanInvites(), []),
    settle(listGroupTrips(userId), { missing: true, groups: [] }),
    settle(fetchTripPlans(userId), []),
    settle(fetchMyVisibility(userId), { visibility: { ...DEFAULT_VISIBILITY }, missing: true }),
    settle(fetchMyProfile(userId), null),
    settle(listJoinRequests(), { missing: true, toMe: [], mine: new Set() }),
    settle(fetchMyPayLink(userId), { url: '', missing: true }),
    settle(listCircles(userId), { missing: true, circles: [] }),
  ]);
  if (loadingFor !== userId) return;
  emit({
    ...EMPTY,
    userId,
    loaded: true,
    me: me ? { handle: me.handle, displayName: me.display_name || '', avatarEmoji: me.avatar_emoji || '' } : null,
    links,
    friendTrips,
    shares,
    invites,
    groups: groupsRes.groups,
    groupsMissing: groupsRes.missing,
    myPlans,
    visibility: vis.visibility,
    visibilityMissing: vis.missing,
    hidden: readHidden(),
    joinToMe: join.toMe,
    joinMine: join.mine,
    joinMissing: join.missing,
    payLink: pay.url,
    payLinkMissing: pay.missing,
    circles: circlesRes.circles,
    circlesMissing: circlesRes.missing,
  });
}

/** Read everything again, now (after an act that changes what is shown). */
export function refreshTogether() {
  refreshFriendTrips();
  if (IS_FRIENDS_MOCK) return Promise.resolve();
  if (!state.userId) return Promise.resolve();
  return load(state.userId);
}

/** The count for the header door: the same rows as Vrienden's Nu band and
 *  status line (waitingOf), so the two numbers never disagree (G16 v3,
 *  judge 1 fix 8). Balances to settle count too. */
export function waitingCount(s) {
  return waitingOf(s).length;
}

/** Kringen waiting on you (G16): an invitation, or proposals without your vote. */
export function circleWaits(s) {
  return (s.circles || []).filter((c) => c.myStatus === 'invited'
    || (c.myStatus === 'joined' && unvotedIn(c, s.userId) > 0));
}

/** How many of a kring's proposals you have not voted on. */
export function unvotedIn(c, me) {
  const mine = new Set((c.votes || []).filter((v) => v.user_id === me).map((v) => v.proposal_id));
  return (c.proposals || []).filter((p) => !mine.has(p.id)).length;
}

/** Mock writes: change the fixture in memory so the seam can be tried. */
function mock(fn) {
  emit(fn(state));
  return Promise.resolve();
}
function mapGroup(s, id, fn) {
  return { ...s, groups: s.groups.map((g) => (g.id === id ? fn(g) : g)) };
}
function mapCircle(s, id, fn) {
  return { ...s, circles: s.circles.map((c) => (c.id === id ? fn(c) : c)) };
}
function mapLedger(s, groupId, fn) {
  const l = s.ledgers[groupId] || { missing: false, expenses: [], settlements: [], payLinks: new Map() };
  return { ...s, ledgers: { ...s.ledgers, [groupId]: fn(l) } };
}
// The other members' private maximums in the seam; never shown, only used
// to answer the band the way group_trip_band() would.
// Trip maximums a person (T938).
const MOCK_OTHER_BUDGETS = { 'g-summer': [705, 1400] };

export const togetherActions = {
  async accept(linkId) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => ({ ...s, links: s.links.map((l) => (l.id === linkId ? { ...l, kind: 'friend' } : l)) }));
    }
    await acceptFriendRequest(linkId);
    return refreshTogether();
  },
  async remove(linkId) {
    if (IS_FRIENDS_MOCK) return mock((s) => ({ ...s, links: s.links.filter((l) => l.id !== linkId) }));
    await removeFriendLink(linkId);
    return refreshTogether();
  },
  async block(linkId) {
    if (IS_FRIENDS_MOCK) return mock((s) => ({ ...s, links: s.links.filter((l) => l.id !== linkId) }));
    await blockFriendLink(linkId);
    return refreshTogether();
  },
  async ask(targetUserId, profile) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => ({ ...s, links: [{ id: `l-${targetUserId}`, kind: 'outgoing', userId: targetUserId, handle: profile?.handle || '', displayName: profile?.displayName || '', avatarEmoji: '' }, ...s.links] }));
    }
    await sendFriendRequest(state.userId, targetUserId);
    return refreshTogether();
  },
  async takeInvite(planId) {
    if (IS_FRIENDS_MOCK) return mock((s) => ({ ...s, invites: s.invites.filter((i) => i.tripPlanId !== planId) }));
    await acceptCoplanInvite(planId, state.userId);
    return refreshTogether();
  },
  async refuseInvite(planId) {
    if (IS_FRIENDS_MOCK) return mock((s) => ({ ...s, invites: s.invites.filter((i) => i.tripPlanId !== planId) }));
    await removeCoplanner(planId, state.userId);
    return refreshTogether();
  },
  /** Reads one group's ledger into the store (Settle up). */
  async loadLedger(groupId) {
    if (IS_FRIENDS_MOCK) return undefined;
    const ledger = await settle(fetchGroupLedger(groupId), { missing: true, expenses: [], settlements: [], payLinks: new Map() });
    emit({ ...state, ledgers: { ...state.ledgers, [groupId]: ledger } });
    return undefined;
  },
  async addExpense(groupId, expense) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapLedger(s, groupId, (l) => ({
        ...l, expenses: [{ ...expense, id: `e-${Date.now()}`, createdBy: s.userId, createdAt: new Date().toISOString() }, ...l.expenses],
      })));
    }
    await addGroupExpense(groupId, state.userId, expense);
    return togetherActions.loadLedger(groupId);
  },
  async deleteExpense(groupId, id) {
    if (IS_FRIENDS_MOCK) return mock((s) => mapLedger(s, groupId, (l) => ({ ...l, expenses: l.expenses.filter((e) => e.id !== id) })));
    await deleteGroupExpense(id);
    return togetherActions.loadLedger(groupId);
  },
  async markPaid(groupId, transfer) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapLedger(s, groupId, (l) => ({
        ...l, settlements: [{ ...transfer, id: `st-${Date.now()}`, createdBy: s.userId, createdAt: new Date().toISOString() }, ...l.settlements],
      })));
    }
    await markTransferPaid(groupId, state.userId, transfer);
    return togetherActions.loadLedger(groupId);
  },
  async deleteSettlement(groupId, id) {
    if (IS_FRIENDS_MOCK) return mock((s) => mapLedger(s, groupId, (l) => ({ ...l, settlements: l.settlements.filter((x) => x.id !== id) })));
    await deleteSettlement(id);
    return togetherActions.loadLedger(groupId);
  },
  async setPayLink(url) {
    const before = state.payLink;
    emit({ ...state, payLink: url });
    if (IS_FRIENDS_MOCK) return undefined;
    try { await saveMyPayLink(state.userId, url); } catch (err) {
      emit({ ...state, payLink: before });
      throw err;
    }
    return undefined;
  },
  async askJoin(planId) {
    if (IS_FRIENDS_MOCK) return mock((s) => ({ ...s, joinMine: new Set([...s.joinMine, planId]) }));
    await askToJoin(planId);
    return refreshTogether();
  },
  async answerJoin(requestId, yes) {
    if (IS_FRIENDS_MOCK) return mock((s) => ({ ...s, joinToMe: s.joinToMe.filter((r) => r.id !== requestId) }));
    await answerJoinRequest(requestId, yes);
    return refreshTogether();
  },
  async inviteToTrip(planId, friendUserId) {
    if (IS_FRIENDS_MOCK) return Promise.resolve();
    await inviteCoplanner(planId, state.userId, friendUserId);
    return undefined;
  },
  async respondGroup(groupId, yes) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => (yes
        ? mapGroup(s, groupId, (g) => ({ ...g, myStatus: 'joined', members: g.members.map((m) => (m.userId === s.userId ? { ...m, status: 'joined' } : m)) }))
        : { ...s, groups: s.groups.filter((g) => g.id !== groupId) }));
    }
    await respondGroupInvite(groupId, state.userId, yes);
    return refreshTogether();
  },
  async vote(groupId, kind, optionId) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapGroup(s, groupId, (g) => ({
        ...g,
        votes: [...g.votes.filter((v) => !(v.kind === kind && v.userId === s.userId)),
          ...(optionId ? [{ kind, userId: s.userId, optionId }] : [])],
      })));
    }
    await castGroupVote(groupId, state.userId, kind, optionId);
    return refreshTogether();
  },
  async setBudget(groupId, maxTrip) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapGroup(s, groupId, (g) => {
        const all = [...(MOCK_OTHER_BUDGETS[groupId] || []), ...(maxTrip ? [maxTrip] : [])];
        const top = bandTopFrom(all);
        return { ...g, myBudget: maxTrip || null, band: { top, set: all.length, members: g.members.length, ready: top != null } };
      }));
    }
    await setGroupBudget(groupId, state.userId, maxTrip);
    return refreshTogether();
  },
  async createGroup(title, friendIds) {
    if (IS_FRIENDS_MOCK) {
      const id = `g-${Date.now()}`;
      await mock((s) => ({
        ...s,
        groups: [{
          id, title, ownerId: s.userId, bookedPlanId: null, myStatus: 'joined',
          members: [{ userId: s.userId, status: 'joined', handle: 'bas_v', name: 'You', emoji: '' },
            ...friendIds.map((fid) => {
              const l = s.links.find((x) => x.userId === fid);
              return { userId: fid, status: 'invited', handle: l?.handle || '', name: l?.displayName || `@${l?.handle}`, emoji: '' };
            })],
          options: [], votes: [], myBudget: null, band: { top: null, set: 0, members: 1, ready: false },
        }, ...s.groups],
      }));
      return id;
    }
    const id = await createGroupTrip(state.userId, title, friendIds);
    await refreshTogether();
    return id;
  },
  async addOption(groupId, option) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapGroup(s, groupId, (g) => ({ ...g, options: [...g.options, { ...option, id: `o-${Date.now()}` }] })));
    }
    await addGroupOption(groupId, option);
    return refreshTogether();
  },
  async book(group, choice) {
    if (IS_FRIENDS_MOCK) {
      await mock((s) => mapGroup(s, group.id, (g) => ({ ...g, bookedPlanId: 'mp-booked' })));
      return 'mp-booked';
    }
    const planId = await bookGroupTrip(group, state.userId, choice);
    await refreshTogether();
    return planId;
  },
  // Kringen (G16, decision 0017). Each write reloads; under the seam the
  // fixture changes in memory.
  async createCircle(name, friendIds) {
    if (IS_FRIENDS_MOCK) {
      const id = `c-${Date.now()}`;
      await mock((s) => ({
        ...s,
        circles: [{
          id, name, ownerId: s.userId, createdAt: new Date().toISOString(), myStatus: 'joined',
          members: [{ userId: s.userId, status: 'joined', handle: s.me?.handle || '', name: s.me?.displayName || '', emoji: '', homeAirport: null },
            ...friendIds.map((fid) => {
              const l = s.links.find((x) => x.userId === fid);
              return { userId: fid, status: 'invited', handle: l?.handle || '', name: l?.displayName || `@${l?.handle}`, emoji: '', homeAirport: null };
            })],
          proposals: [], votes: [], availability: [], mockFares: {},
        }, ...s.circles],
      }));
      return id;
    }
    const id = await createCircle(state.userId, name, friendIds);
    await refreshTogether();
    return id;
  },
  async respondCircle(circleId, yes) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => (yes
        ? mapCircle(s, circleId, (c) => ({ ...c, myStatus: 'joined', members: c.members.map((m) => (m.userId === s.userId ? { ...m, status: 'joined' } : m)) }))
        : { ...s, circles: s.circles.filter((c) => c.id !== circleId) }));
    }
    await respondCircleInvite(circleId, state.userId, yes);
    return refreshTogether();
  },
  async propose(circleId, destId) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapCircle(s, circleId, (c) => (c.proposals.some((p) => p.destId === destId) ? c : {
        ...c, proposals: [...c.proposals, { id: `p-${Date.now()}`, destId, createdBy: s.userId, created_at: new Date().toISOString() }],
      })));
    }
    await addProposal(circleId, destId);
    return refreshTogether();
  },
  async unpropose(circleId, proposalId) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapCircle(s, circleId, (c) => ({ ...c, proposals: c.proposals.filter((p) => p.id !== proposalId), votes: c.votes.filter((v) => v.proposal_id !== proposalId) })));
    }
    await deleteProposal(proposalId);
    return refreshTogether();
  },
  async voteCircle(circleId, proposalId, value) {
    // The vote shows at once; the server answer settles it.
    const apply = (s) => mapCircle(s, circleId, (c) => ({
      ...c,
      votes: [...c.votes.filter((v) => !(v.proposal_id === proposalId && v.user_id === s.userId)),
        ...(value ? [{ proposal_id: proposalId, user_id: s.userId, value }] : [])],
    }));
    emit(apply(state));
    if (IS_FRIENDS_MOCK) return undefined;
    try { await castCircleVote(circleId, proposalId, state.userId, value); } finally { await refreshTogether(); }
    return undefined;
  },
  async setCircleDays(circleId, ranges) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapCircle(s, circleId, (c) => ({
        ...c,
        availability: [...c.availability.filter((a) => a.user_id !== s.userId),
          ...ranges.slice(0, 20).map((r, i) => ({ id: `a-me-${i}`, user_id: s.userId, start_date: r.start, end_date: r.end }))],
      })));
    }
    await setMyAvailability(circleId, state.userId, ranges);
    return refreshTogether();
  },
  async setCircleAirport(circleId, code) {
    if (IS_FRIENDS_MOCK) {
      return mock((s) => mapCircle(s, circleId, (c) => ({ ...c, members: c.members.map((m) => (m.userId === s.userId ? { ...m, homeAirport: code || null } : m)) })));
    }
    await setMyHomeAirport(circleId, state.userId, code);
    return refreshTogether();
  },
  async makeCircleTrip(circle, choice) {
    if (IS_FRIENDS_MOCK) return 'mp-circle';
    return makeCircleTrip(circle, state.userId, choice);
  },
  async setVisibility(patch) {
    const next = { ...state.visibility, ...patch };
    const before = state.visibility;
    emit({ ...state, visibility: next });
    if (IS_FRIENDS_MOCK) return undefined;
    try { await saveMyVisibility(state.userId, next); } catch (err) {
      emit({ ...state, visibility: before });
      throw err;
    }
    return undefined;
  },
  hideMeet(key) {
    emit({ ...state, hidden: hideOverlap(key) });
  },
};

/**
 * The shared state for the signed-in account (or the seam's fixture). Loads
 * on first use per account; signed out it is EMPTY with loaded true.
 */
export function useTogether() {
  const { user } = useAuth();
  // ?friendsmock=guest is a signed-out visitor (the guest invite card).
  const userId = IS_FRIENDS_MOCK ? (FRIENDS_MOCK === 'guest' ? null : MOCK_ME) : (user?.id || null);
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!userId) {
      if (state.userId) { loadingFor = null; emit({ ...EMPTY, loaded: true }); }
      return;
    }
    if (state.userId !== userId && loadingFor !== userId) load(userId);
  }, [userId]);
  if (!userId) return { ...EMPTY, loaded: true, signedIn: false };
  return { ...s, signedIn: s.userId === userId };
}

/** Every place Vrienden names (friends' trips, your plans, kring
 *  proposals), so the door can start their names' lookup (G16). */
export function togetherDestIds() {
  return [
    ...state.friendTrips.flatMap((tr) => tr.destinationIds || []),
    ...state.myPlans.flatMap((p) => p.destination_ids || []),
    ...(state.circles || []).flatMap((c) => (c.proposals || []).map((p) => p.destId)),
  ];
}

/** Accepted friends' ids, from the links. */
export function friendIdsOf(s) {
  return new Set(s.links.filter((l) => l.kind === 'friend').map((l) => l.userId));
}

/** Per-trip stops with dates, from every friend's shares, for overlaps. */
export function stopsByTripOf(s) {
  const m = new Map();
  for (const sh of s.shares.values()) {
    for (const [id, tr] of sh.trips) if (tr.stops?.length) m.set(id, tr.stops);
  }
  return m;
}

/** What one friend shares, with the defaults when 056 gave nothing. */
export function shareOf(s, friendId) {
  return s.shares.get(friendId) || { ...DEFAULT_VISIBILITY, countries: [], saves: [], trips: new Map() };
}
