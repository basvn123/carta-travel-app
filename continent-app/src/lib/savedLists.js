/**
 * savedLists.js, the traveller's own lists of saved things and what Carta
 * knew about each save when it was made (T925).
 *
 * A save itself is still a favourite key (lib/favorites.js, `kind:id`); this
 * file adds two things on top of the keys and never replaces them:
 *
 *   lists  [{ id, name, keys: [favKey], at }] in the traveller's order. A key
 *          may sit in several lists; "All saved" is every favourite and is
 *          not stored.
 *   meta   { [favKey]: { at, eur, note, gone } }: when it was saved (ms),
 *          the day price Carta showed at that moment (whole euros a person
 *          a day, only where Carta prices that kind), the traveller's own
 *          note, and when it was last unsaved (so an Undo keeps the price it
 *          was saved at instead of taking today's).
 *
 * Stored the way the hand-marked countries are (lib/visitedCountries.js):
 * local first, in this browser, and carried to the account inside
 * user_settings by useAccountSync, the pull merging and the push writing
 * this device's copy back. No new table and no migration.
 */
import { useEffect, useState } from 'react';

const KEY = 'carta.savedLists.v1';
const listeners = new Set();
/** An unsave undone within this many ms keeps the price it was saved at. */
export const REVIVE_MS = 60_000;
export const MAX_LISTS = 30;
export const MAX_NOTE = 140;

const EMPTY = { lists: [], meta: {} };

function clean(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const lists = (Array.isArray(raw.lists) ? raw.lists : [])
    .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
    .map((l) => ({
      id: l.id,
      name: l.name.slice(0, 60),
      keys: [...new Set((Array.isArray(l.keys) ? l.keys : []).filter((k) => typeof k === 'string' && k))],
      at: Number(l.at) || 0,
    }))
    .slice(0, MAX_LISTS);
  const meta = {};
  if (raw.meta && typeof raw.meta === 'object') {
    for (const [k, m] of Object.entries(raw.meta)) {
      if (!k || !m || typeof m !== 'object') continue;
      const row = {};
      if (Number.isFinite(m.at)) row.at = m.at;
      if (Number.isFinite(m.eur) && m.eur > 0) row.eur = Math.round(m.eur);
      if (typeof m.note === 'string' && m.note.trim()) row.note = m.note.slice(0, MAX_NOTE);
      if (Number.isFinite(m.gone)) row.gone = m.gone;
      if (Object.keys(row).length) meta[k] = row;
    }
  }
  return { lists, meta };
}

function read() {
  try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return { ...EMPTY }; }
}

function write(next) {
  const c = clean(next);
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(c));
  return c;
}

export function loadSavedLists() { return read(); }

/** The blob as it travels to the account (useAccountSync). */
export function savedListsForSync() { return read(); }

/**
 * Something was just saved. `eur` is the day price Carta shows for it now,
 * or null where Carta prices nothing for that kind. An unsave undone within
 * REVIVE_MS keeps its first price, so Undo never resets the "since you saved
 * it" figure.
 */
export function noteSaved(key, eur = null, now = Date.now()) {
  if (!key) return read();
  const cur = read();
  const was = cur.meta[key];
  const revived = was && Number.isFinite(was.gone) && now - was.gone < REVIVE_MS;
  const row = revived
    ? { ...was, gone: undefined }
    : { at: now, ...(Number.isFinite(eur) && eur > 0 ? { eur: Math.round(eur) } : {}), ...(was?.note ? { note: was.note } : {}) };
  return write({ ...cur, meta: { ...cur.meta, [key]: row } });
}

/** Something was unsaved: its record stays a minute for an Undo. */
export function noteUnsaved(key, now = Date.now()) {
  if (!key) return read();
  const cur = read();
  const was = cur.meta[key];
  if (!was) return cur;
  return write({ ...cur, meta: { ...cur.meta, [key]: { ...was, gone: now } } });
}

export function setNote(key, note) {
  const cur = read();
  const was = cur.meta[key] || {};
  const text = String(note || '').trim().slice(0, MAX_NOTE);
  const row = { ...was, note: text || undefined };
  return write({ ...cur, meta: { ...cur.meta, [key]: row } });
}

export function newListId(now = Date.now()) {
  return `l${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function createList(name, keys = [], now = Date.now()) {
  const cur = read();
  const label = String(name || '').trim().slice(0, 60);
  if (!label || cur.lists.length >= MAX_LISTS) return { state: cur, id: null };
  const id = newListId(now);
  const state = write({ ...cur, lists: [...cur.lists, { id, name: label, keys, at: now }] });
  return { state, id };
}

export function renameList(id, name) {
  const label = String(name || '').trim().slice(0, 60);
  const cur = read();
  if (!label) return cur;
  return write({ ...cur, lists: cur.lists.map((l) => (l.id === id ? { ...l, name: label } : l)) });
}

/** Removes a list; returns the removed list and its index, for an Undo. */
export function deleteList(id) {
  const cur = read();
  const at = cur.lists.findIndex((l) => l.id === id);
  if (at < 0) return { state: cur, removed: null, at };
  const removed = cur.lists[at];
  return { state: write({ ...cur, lists: cur.lists.filter((l) => l.id !== id) }), removed, at };
}

export function restoreList(list, at) {
  const cur = read();
  if (!list || cur.lists.some((l) => l.id === list.id)) return cur;
  const lists = [...cur.lists];
  lists.splice(Math.max(0, Math.min(at, lists.length)), 0, list);
  return write({ ...cur, lists });
}

/** Moves a list one place earlier (-1) or later (+1). */
export function moveList(id, step) {
  const cur = read();
  const i = cur.lists.findIndex((l) => l.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= cur.lists.length) return cur;
  const lists = [...cur.lists];
  [lists[i], lists[j]] = [lists[j], lists[i]];
  return write({ ...cur, lists });
}

/** Puts a saved thing in a list or takes it out. */
export function toggleInList(id, key) {
  const cur = read();
  return write({
    ...cur,
    lists: cur.lists.map((l) => {
      if (l.id !== id) return l;
      return { ...l, keys: l.keys.includes(key) ? l.keys.filter((k) => k !== key) : [...l.keys, key] };
    }),
  });
}

/**
 * The account's copy joins this device's (pure, for the tests): lists by id,
 * this device's name and order winning, the keys of both kept; for a save's
 * record the earlier save time and its price win, a note written here wins.
 */
export function mergeSavedLists(local, incoming) {
  const a = clean(local);
  const b = clean(incoming);
  const lists = [...a.lists];
  for (const l of b.lists) {
    const i = lists.findIndex((x) => x.id === l.id);
    if (i < 0) lists.push(l);
    else lists[i] = { ...lists[i], keys: [...new Set([...lists[i].keys, ...l.keys])] };
  }
  const meta = { ...b.meta };
  for (const [k, m] of Object.entries(a.meta)) {
    const o = meta[k];
    if (!o) { meta[k] = m; continue; }
    const first = (o.at ?? Infinity) < (m.at ?? Infinity) ? o : m;
    meta[k] = { ...o, ...m, at: first.at, eur: first.eur, note: m.note || o.note };
  }
  return clean({ lists, meta });
}

export function mergeSavedListsIntoDevice(incoming) {
  if (!incoming || typeof incoming !== 'object') return read();
  return write(mergeSavedLists(read(), incoming));
}

/**
 * How a saved thing's day price moved since it was saved: { diff, at } in
 * whole euros (negative is cheaper), or null when no price was recorded at
 * save time, there is none now, or it moved by less than a euro.
 */
export function priceChange(meta, nowEur) {
  if (!meta || !Number.isFinite(meta.eur) || !Number.isFinite(nowEur)) return null;
  const diff = Math.round(nowEur) - meta.eur;
  if (Math.abs(diff) < 1) return null;
  return { diff, at: meta.at || null };
}

export function subscribeSavedLists(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The lists and the records, current across every component that shows them. */
export function useSavedLists() {
  const [state, setState] = useState(read);
  useEffect(() => subscribeSavedLists(setState), []);
  return state;
}
