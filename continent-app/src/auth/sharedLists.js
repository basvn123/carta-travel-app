/**
 * sharedLists.js, Saved lists shared with friends (T941, migration 059).
 *
 * A private list stays on the device (lib/savedLists.js). Sharing one moves
 * it to the server: the owner names accepted friends, every member adds
 * saved things, writes the note on an item and votes, one vote per member
 * per item. Every rule is in SQL (059): only members read or write, only the
 * owner adds or removes members, and only an accepted friend can be added.
 *
 * Works before 059 is applied: a missing table or function answers
 * `{ missing: true }`, and Saved shows no shared list and no Share action,
 * never an error.
 *
 * Under ?savedmock the hook keeps a fixture list in memory instead (dev only,
 * the same precedent as ?friendsmock).
 */
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabaseClient.js';
import { isMissing } from './friendVisibility.js';
import { listsFromRows, withVote } from '../lib/sharedListModel.js';

const MISSING = { missing: true, lists: [] };
const clip = (s, n) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
const httpsImg = (u) => (typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 600 ? u : null);

function itemRow(listId, item) {
  return {
    list_id: listId,
    item_key: item.key,
    name: clip(item.name, 120),
    cc: /^[A-Za-z]{2}$/.test(item.cc || '') ? item.cc.toUpperCase() : null,
    img: httpsImg(item.img),
    note: clip(item.note, 140),
  };
}

/** Every shared list you are in, with members, items and votes. */
export async function listSharedLists(userId) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return MISSING;
  const { data: lists, error } = await supabase
    .from('shared_lists')
    .select('id, owner_id, name, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    if (!isMissing(error)) console.warn('[shared lists] could not read:', error.message || error);
    return MISSING;
  }
  if (!lists?.length) return { missing: false, lists: [] };
  const ids = lists.map((l) => l.id);
  const [people, items, votes] = await Promise.all([
    supabase.rpc('shared_list_people'),
    supabase.from('shared_list_items').select('id, list_id, item_key, name, cc, img, note, added_by, created_at').in('list_id', ids),
    supabase.from('shared_list_votes').select('item_id, list_id, user_id').in('list_id', ids),
  ]);
  if ([people, items, votes].some((r) => r.error && isMissing(r.error))) return MISSING;
  return {
    missing: false,
    lists: listsFromRows({ lists, people: people.data || [], items: items.data || [], votes: votes.data || [] }, userId),
  };
}

/** A private list, shared: the list, its friends and its items, on the server. */
export async function createSharedList(userId, name, friendIds = [], items = []) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('shared_lists')
    .insert({ owner_id: userId, name: String(name || '').trim().slice(0, 60) })
    .select('id')
    .single();
  if (error) throw error;
  const id = data.id;
  if (friendIds.length) {
    const { error: mErr } = await supabase.from('shared_list_members')
      .insert(friendIds.map((u) => ({ list_id: id, user_id: u, added_by: userId })));
    if (mErr) throw mErr;
  }
  if (items.length) {
    const { error: iErr } = await supabase.from('shared_list_items')
      .insert(items.map((it) => ({ ...itemRow(id, it), added_by: userId })));
    if (iErr) throw iErr;
  }
  return id;
}

async function run(fn) {
  const supabase = await getSupabase();
  if (!supabase) return;
  const { error } = await fn(supabase);
  if (error) throw error;
}

export const addSharedMember = (listId, userId, by) => run((s) => s.from('shared_list_members').insert({ list_id: listId, user_id: userId, added_by: by }));
export const removeSharedMember = (listId, userId) => run((s) => s.from('shared_list_members').delete().eq('list_id', listId).eq('user_id', userId));
export const renameSharedList = (listId, name) => run((s) => s.from('shared_lists').update({ name: String(name).trim().slice(0, 60), updated_at: new Date().toISOString() }).eq('id', listId));
export const deleteSharedList = (listId) => run((s) => s.from('shared_lists').delete().eq('id', listId));
export const addSharedItem = (listId, userId, item) => run((s) => s.from('shared_list_items').upsert({ ...itemRow(listId, item), added_by: userId }, { onConflict: 'list_id,item_key', ignoreDuplicates: true }));
export const removeSharedItem = (itemId) => run((s) => s.from('shared_list_items').delete().eq('id', itemId));
export const setSharedNote = (itemId, note) => run((s) => s.from('shared_list_items').update({ note: clip(note, 140) }).eq('id', itemId));
export const setSharedVote = (listId, itemId, userId, on) => run((s) => (on
  ? s.from('shared_list_votes').upsert({ list_id: listId, item_id: itemId, user_id: userId }, { onConflict: 'item_id,user_id', ignoreDuplicates: true })
  : s.from('shared_list_votes').delete().eq('item_id', itemId).eq('user_id', userId)));

// ---------------------------------------------------------------- the seam

export const MOCK_ME = 'u-me';
/** The seam's accepted friends, for the Share picker. */
export const MOCK_FRIENDS = [
  { id: 'fl1', kind: 'friend', userId: 'u-sofie', handle: 'sofie_v', displayName: 'Sofie Vermeulen', avatarEmoji: '' },
  { id: 'fl2', kind: 'friend', userId: 'u-jonas', handle: 'jonas', displayName: 'Jonas Peeters', avatarEmoji: '' },
  { id: 'fl3', kind: 'friend', userId: 'u-lena', handle: 'lena', displayName: 'Lena Maes', avatarEmoji: '' },
];
const mockPerson = (f) => ({ userId: f.userId, handle: f.handle, name: f.displayName, emoji: f.avatarEmoji });
const ME = { userId: MOCK_ME, handle: 'you', name: 'You', emoji: '' };
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
let mockLists = [{
  id: 'sl1', name: 'Porto with friends', ownerId: MOCK_ME, mine: true,
  members: [ME, mockPerson(MOCK_FRIENDS[0]), mockPerson(MOCK_FRIENDS[1])],
  items: [
    { id: 'si1', key: 'dest:OPO', kind: 'dest', name: 'Porto', cc: 'PT', img: null, note: 'Rooftop bar Sofie found', addedBy: 'u-sofie', at: ago(9), votes: ['u-sofie', 'u-jonas', MOCK_ME] },
    { id: 'si2', key: 'dest:LIS', kind: 'dest', name: 'Lisbon', cc: 'PT', img: null, note: '', addedBy: MOCK_ME, at: ago(8), votes: ['u-sofie'] },
    { id: 'si3', key: 'dest:BCN', kind: 'dest', name: 'Barcelona', cc: 'ES', img: null, note: '', addedBy: 'u-jonas', at: ago(5), votes: [] },
  ],
}];
let mockSeq = 0;
const mockListeners = new Set();
const mockSet = (fn) => { mockLists = fn(mockLists); mockListeners.forEach((f) => f(mockLists)); };
const mapList = (id, fn) => mockSet((ls) => ls.map((l) => (l.id === id ? fn(l) : l)));

function mockActions() {
  return {
    create: async (name, friendIds = [], items = []) => {
      const id = `slm${++mockSeq}`;
      mockSet((ls) => [...ls, {
        id, name, ownerId: MOCK_ME, mine: true,
        members: [ME, ...MOCK_FRIENDS.filter((f) => friendIds.includes(f.userId)).map(mockPerson)],
        items: items.map((it, i) => ({ id: `${id}i${i}`, key: it.key, kind: it.key.split(':')[0], name: it.name || '', cc: it.cc || '', img: it.img || null, note: it.note || '', addedBy: MOCK_ME, at: new Date().toISOString(), votes: [] })),
      }]);
      return id;
    },
    addMember: async (listId, userId) => mapList(listId, (l) => ({ ...l, members: [...l.members, mockPerson(MOCK_FRIENDS.find((f) => f.userId === userId))] })),
    removeMember: async (listId, userId) => (userId === MOCK_ME
      ? mockSet((ls) => ls.filter((l) => l.id !== listId))
      : mapList(listId, (l) => ({ ...l, members: l.members.filter((m) => m.userId !== userId) }))),
    rename: async (listId, name) => mapList(listId, (l) => ({ ...l, name })),
    remove: async (listId) => mockSet((ls) => ls.filter((l) => l.id !== listId)),
    addItem: async (listId, item) => mapList(listId, (l) => (l.items.some((it) => it.key === item.key) ? l : {
      ...l, items: [...l.items, { id: `si${++mockSeq}x`, key: item.key, kind: item.key.split(':')[0], name: item.name || '', cc: item.cc || '', img: item.img || null, note: '', addedBy: MOCK_ME, at: new Date().toISOString(), votes: [] }],
    })),
    removeItem: async (listId, itemId) => mapList(listId, (l) => ({ ...l, items: l.items.filter((it) => it.id !== itemId) })),
    note: async (listId, itemId, note) => mapList(listId, (l) => ({ ...l, items: l.items.map((it) => (it.id === itemId ? { ...it, note: String(note || '').trim().slice(0, 140) } : it)) })),
    vote: async (listId, itemId, on) => mapList(listId, (l) => ({ ...l, items: l.items.map((it) => (it.id === itemId ? withVote(it, MOCK_ME, on) : it)) })),
  };
}

/**
 * The shared lists for Saved: { missing, lists, me, act }. `act` holds the
 * writes; each reloads the lists when it lands. While `missing` is true (059
 * not applied, no account, accounts off) there is nothing to draw.
 */
export function useSharedLists(user, { mock = false } = {}) {
  const userId = mock ? MOCK_ME : user?.id || null;
  const [state, setState] = useState(() => (mock ? { missing: false, lists: mockLists } : MISSING));
  const reload = useCallback(async () => {
    if (mock) return;
    if (!userId) { setState(MISSING); return; }
    try { setState(await listSharedLists(userId)); } catch { setState(MISSING); }
  }, [mock, userId]);
  useEffect(() => {
    if (mock) {
      const on = (ls) => setState({ missing: false, lists: ls });
      mockListeners.add(on);
      return () => { mockListeners.delete(on); };
    }
    reload();
    return undefined;
  }, [mock, reload]);

  const after = (p) => p.then((v) => { reload(); return v; });
  const act = mock ? mockActions() : {
    create: (name, friendIds, items) => after(createSharedList(userId, name, friendIds, items)),
    addMember: (listId, uid) => after(addSharedMember(listId, uid, userId)),
    removeMember: (listId, uid) => after(removeSharedMember(listId, uid)),
    rename: (listId, name) => after(renameSharedList(listId, name)),
    remove: (listId) => after(deleteSharedList(listId)),
    addItem: (listId, item) => after(addSharedItem(listId, userId, item)),
    removeItem: (listId, itemId) => after(removeSharedItem(itemId)),
    note: (listId, itemId, note) => after(setSharedNote(itemId, note)),
    vote: (listId, itemId, on) => {
      // The vote shows at once; the reload settles it.
      setState((s) => ({ ...s, lists: s.lists.map((l) => (l.id !== listId ? l : { ...l, items: l.items.map((it) => (it.id === itemId ? withVote(it, userId, on) : it)) })) }));
      return after(setSharedVote(listId, itemId, userId, on));
    },
  };
  return { ...state, me: userId, act };
}
