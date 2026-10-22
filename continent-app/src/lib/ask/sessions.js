/*
 * Ask Carta's chats (T570): every conversation is kept on this device, so a
 * traveller can come back to it and ask on; signed in, it is kept in the
 * account too (T575, src/auth/askChatCloud.js, mergeChats below). A turn keeps its question
 * and the written answer it got, so reopening a chat redraws the facts from
 * the catalogue (the same question gives the same facts) without asking the
 * model again.
 *
 *   Session = { id, title, at, turns: [Turn] }
 *   Turn    = { id, q, at, written?: { state, sentences, backend } }
 *
 * Pure apart from the storage accessors, which take any Storage-shaped
 * object and never throw (a private window or blocked storage reads empty).
 */

export const KEY = 'carta.ask.chats.v1';
/** At most this many chats are kept, the newest first. */
export const MAX_CHATS = 30;
/** And this many turns in one chat. */
export const MAX_TURNS = 40;
const TITLE_MAX = 60;

const store = () => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

export function newId(now = Date.now()) {
  return `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** A chat's title: its first question, cut at a word near TITLE_MAX. */
export function titleOf(q) {
  const s = String(q || '').replace(/\s+/g, ' ').trim();
  if (s.length <= TITLE_MAX) return s;
  const cut = s.slice(0, TITLE_MAX);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 20 ? cut.slice(0, sp) : cut).trim()}...`;
}

function valid(s) {
  return s && typeof s.id === 'string' && Array.isArray(s.turns) && s.turns.length > 0
    && s.turns.every((t) => t && typeof t.q === 'string');
}

export function loadChats(storage = store()) {
  try {
    const raw = storage?.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(valid).sort((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}

export function saveChats(list, storage = store()) {
  try {
    storage?.setItem(KEY, JSON.stringify(list.slice(0, MAX_CHATS)));
  } catch {
    // Full or blocked storage: the chat still works for this visit.
  }
}

/** The list with `chat` in it (added or replaced), newest first. */
export function upsertChat(list, chat) {
  if (!valid(chat)) return list;
  const kept = { ...chat, turns: chat.turns.slice(-MAX_TURNS) };
  return [kept, ...list.filter((c) => c.id !== chat.id)].sort((a, b) => b.at - a.at).slice(0, MAX_CHATS);
}

export function removeChat(list, id) {
  return list.filter((c) => c.id !== id);
}

/** Chats in three groups by their last turn: today, the last 7 days, older. */
export function groupChats(list, now = Date.now()) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  const week = today - 6 * 86400000;
  const groups = { today: [], week: [], older: [] };
  for (const c of list) {
    if (c.at >= today) groups.today.push(c);
    else if (c.at >= week) groups.week.push(c);
    else groups.older.push(c);
  }
  return groups;
}

/**
 * The device's chats and the account's (T575), as one list. Rows are the
 * ask_chats table's ({ chat_id, title, turns, updated_at, deleted_at }).
 * The newer side wins a chat both hold; a chat deleted in the account goes
 * from the device unless it was changed there after; a chat only the device
 * holds is the device's to add (the first sign-in brings a device's chats
 * into the account). Returns { list, upload }: the merged list, newest
 * first, and the chats the account should be sent.
 */
export function mergeChats(local, rows) {
  const byId = new Map(local.map((c) => [c.id, c]));
  const upload = [];
  const seen = new Set();
  for (const r of rows || []) {
    if (!r?.chat_id) continue;
    seen.add(r.chat_id);
    const mine = byId.get(r.chat_id);
    const at = Date.parse(r.deleted_at || r.updated_at) || 0;
    if (r.deleted_at) {
      if (mine && mine.at > at) upload.push(mine);
      else byId.delete(r.chat_id);
      continue;
    }
    const theirs = { id: r.chat_id, title: r.title || '', at, turns: Array.isArray(r.turns) ? r.turns : [] };
    if (!mine || at > mine.at) byId.set(r.chat_id, theirs);
    else if (mine.at > at) upload.push(mine);
  }
  for (const c of local) if (!seen.has(c.id)) upload.push(c);
  const list = [...byId.values()].filter(valid).sort((a, b) => b.at - a.at).slice(0, MAX_CHATS);
  return { list, upload: upload.filter(valid) };
}
