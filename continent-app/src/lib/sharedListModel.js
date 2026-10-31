/**
 * sharedListModel.js, the pure part of shared Saved lists (T941, migration
 * 059): the server's rows in the one shape Saved draws, and the small
 * questions the tab asks of it. No React, no Supabase, so
 * tests/sharedLists.test.mjs checks it in node.
 *
 *   list   { id, name, ownerId, mine, members: [person], items: [item] }
 *   person { userId, handle, name, emoji }
 *   item   { id, key, kind, name, cc, img, note, addedBy, at, votes: [userId] }
 */

/** The favourite key's kind: `dest:LIS` is a dest, `trail:AT/123` a trail. */
export function keyKind(key) {
  const i = String(key || '').indexOf(':');
  return i > 0 ? key.slice(0, i) : '';
}

function person(p) {
  return {
    userId: p.user_id,
    handle: p.handle || '',
    name: p.display_name || (p.handle ? `@${p.handle}` : ''),
    emoji: p.avatar_emoji || '',
  };
}

/**
 * The tables' rows, joined: every list with its members (from
 * shared_list_people()), its items and each item's voters. Items run in the
 * order they were added; the tab sorts them.
 */
export function listsFromRows({ lists = [], people = [], items = [], votes = [] } = {}, userId = null) {
  const votesBy = new Map();
  for (const v of votes) {
    if (!votesBy.has(v.item_id)) votesBy.set(v.item_id, []);
    votesBy.get(v.item_id).push(v.user_id);
  }
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    ownerId: l.owner_id,
    mine: !!userId && l.owner_id === userId,
    members: people.filter((p) => p.list_id === l.id).map(person),
    items: items
      .filter((it) => it.list_id === l.id)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .map((it) => ({
        id: it.id,
        key: it.item_key,
        kind: keyKind(it.item_key),
        name: it.name || '',
        cc: it.cc || '',
        img: it.img || null,
        note: it.note || '',
        addedBy: it.added_by,
        at: it.created_at || null,
        votes: [...new Set(votesBy.get(it.id) || [])],
      })),
  }));
}

/** An item's votes: how many, and whether one of them is yours. */
export function voteState(item, userId) {
  const votes = item?.votes || [];
  return { n: votes.length, mine: !!userId && votes.includes(userId) };
}

/** The item with your vote added or taken away (one vote per member). */
export function withVote(item, userId, on) {
  const rest = (item.votes || []).filter((u) => u !== userId);
  return { ...item, votes: on ? [...rest, userId] : rest };
}

/** Most votes first; a tie keeps the order the items were added in. */
export function byVotes(items = []) {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (b.it.votes?.length || 0) - (a.it.votes?.length || 0) || a.i - b.i)
    .map((x) => x.it);
}

/** A member by user id, or null (someone who left, or the list's ghost). */
export function memberOf(list, userId) {
  return (list?.members || []).find((m) => m.userId === userId) || null;
}

/** What you may do to an item: the owner and the person who added it remove. */
export function canRemoveItem(list, item, userId) {
  return !!userId && (list?.ownerId === userId || item?.addedBy === userId);
}

/** The accepted friends the owner can still add: not yet in the list. */
export function friendsToAdd(friends = [], list = null) {
  const inList = new Set((list?.members || []).map((m) => m.userId));
  return friends.filter((f) => f && f.userId && !inList.has(f.userId));
}

/** The keys of every item in every shared list, for resolving their photos. */
export function sharedKeys(lists = []) {
  return [...new Set(lists.flatMap((l) => (l.items || []).map((it) => it.key)))];
}
