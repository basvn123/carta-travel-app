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
import { owesVote, bandTopFrom } from './groupBand.js';
import { readHidden, hideOverlap } from './overlaps.js';
import { IS_FRIENDS_MOCK, MOCK_ME, mockState } from './friendsMock.js';

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
    emit({ ...EMPTY, ...mockState(), userId: MOCK_ME, loaded: true, hidden: readHidden() });
    return;
  }
  loadingFor = userId;
  const [links, friendTrips, shares, invites, groupsRes, myPlans, vis, me, join] = await Promise.all([
    settle(fetchFriendLinks(userId), []),
    settle(listFriendTrips(), []),
    settle(listFriendShares(), new Map()),
    settle(listCoplanInvites(), []),
    settle(listGroupTrips(userId), { missing: true, groups: [] }),
    settle(fetchTripPlans(userId), []),
    settle(fetchMyVisibility(userId), { visibility: { ...DEFAULT_VISIBILITY }, missing: true }),
    settle(fetchMyProfile(userId), null),
    settle(listJoinRequests(), { missing: true, toMe: [], mine: new Set() }),
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
  });
}

/** Read everything again, now (after an act that changes what is shown). */
export function refreshTogether() {
  refreshFriendTrips();
  if (IS_FRIENDS_MOCK) return Promise.resolve();
  if (!state.userId) return Promise.resolve();
  return load(state.userId);
}

/** The count for the header door. */
export function waitingCount(s) {
  const incoming = s.links.filter((l) => l.kind === 'incoming').length;
  const groupInvites = s.groups.filter((g) => g.myStatus === 'invited').length;
  const votes = s.groups.filter((g) => g.myStatus === 'joined' && !g.bookedPlanId
    && (owesVote(g.options, g.votes, s.userId, 'when') || owesVote(g.options, g.votes, s.userId, 'where'))).length;
  return incoming + s.invites.length + groupInvites + votes + (s.joinToMe?.length || 0);
}

/** Mock writes: change the fixture in memory so the seam can be tried. */
function mock(fn) {
  emit(fn(state));
  return Promise.resolve();
}
function mapGroup(s, id, fn) {
  return { ...s, groups: s.groups.map((g) => (g.id === id ? fn(g) : g)) };
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
  const userId = IS_FRIENDS_MOCK ? MOCK_ME : (user?.id || null);
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
