import { useEffect, useState } from 'react';
import { listFriendTrips } from './friends.js';

/**
 * The trips friends chose to show you, read once and shared (T466).
 *
 * The Friends page, My trips and the destination page all want the same
 * list (`list_friend_trips`, migration 011 and 019), and a destination page
 * opened ten times in a session should not ask ten times. One request is
 * kept per signed-in user for a minute; `refreshFriendTrips()` drops it, so
 * the Friends page can re-read after accepting somebody, which is exactly
 * the moment their trips become visible.
 *
 * Returns { trips, loaded }. Signed out, or before the first answer, trips
 * is []; a failed read also settles to [] (the surfaces that use this say
 * nothing rather than show an error about somebody else's plans).
 */

const TTL_MS = 60 * 1000;
let cache = { userId: null, at: 0, promise: null };

export function refreshFriendTrips() {
  cache = { userId: null, at: 0, promise: null };
}

function read(userId) {
  const fresh = cache.promise && cache.userId === userId && Date.now() - cache.at < TTL_MS;
  if (!fresh) {
    cache = {
      userId,
      at: Date.now(),
      promise: listFriendTrips().catch(() => []),
    };
  }
  return cache.promise;
}

export function useFriendTrips(userId) {
  const [state, setState] = useState({ trips: [], loaded: false });
  useEffect(() => {
    if (!userId) { setState({ trips: [], loaded: true }); return undefined; }
    let live = true;
    read(userId).then((trips) => { if (live) setState({ trips: trips || [], loaded: true }); });
    return () => { live = false; };
  }, [userId]);
  return state;
}

/** The friend trips that stop at one destination, newest first. */
export function tripsAt(trips, destId) {
  if (!destId || !trips?.length) return [];
  return trips
    .filter((t) => (t.destinationIds || []).includes(destId))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/** One entry per person, in the order their trips came: the faces to draw. */
export function ownersOf(trips) {
  const seen = new Map();
  for (const t of trips || []) {
    if (!seen.has(t.ownerId)) {
      seen.set(t.ownerId, { id: t.ownerId, name: t.ownerName || `@${t.ownerHandle}`, emoji: t.ownerEmoji || '' });
    }
  }
  return [...seen.values()];
}

/** Two letters for a face: the first of the first two words of a name or
 *  handle ("Sofie Vermeulen" SV, "@ana_r" A). */
export function initialsOf(name) {
  const words = String(name || '').replace(/^@/, '').split(/[\s_.-]+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}
