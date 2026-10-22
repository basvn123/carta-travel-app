/*
 * Ask Carta's chats (T570): every conversation is kept on this device, so a
 * traveller can come back to it and ask on. Nothing leaves the browser and
 * nothing is sent to an account (yet, row T570-a). A turn keeps its question
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
