/**
 * Volgen: prices the traveller follows (G12, decision 6 of the My trips
 * redesign). A stay, a flight or a place's own day, each with the prices
 * Carta measured since the traveller started following it.
 *
 * On the device under carta.watch.v1:
 *   { v: 1, owner: userId | null, items: { [id]: item }, removed: { [id]: ms } }
 *   item { id, kind: 'stay'|'flight'|'day', ref, label, placeKey, unitNote,
 *          source, pts: [{ at: ISO, eur }], alert: boolean, at: ms }
 * `at` is the item's last change, the merge's clock.
 *
 * Signed in, the items also live in account_things under kind 'watch'
 * (migration 076, the owner applies it). Like the taste sync it runs beside
 * accountSync.js, so a project without 076 (the kind check answers 23514)
 * turns only this off and the trips keep syncing.
 *
 * A point is added only when Carta measures a price that differs from the
 * last point or falls on a new day; a price that did not move on the same
 * day is the same observation.
 */

export const WATCH_KEY = 'carta.watch.v1';
export const WATCH_KIND = 'watch';
export const WATCH_KINDS = ['stay', 'flight', 'day'];
// A daily point for about half a year; the first point stays, it is what
// "since you started following" is measured from.
export const MAX_POINTS = 180;
const OFF_CODES = ['PGRST205', '42P01', 'PGRST202', '23514'];
const EVENT = 'carta:watch';

const empty = () => ({ v: 1, owner: null, items: {}, removed: {} });
const dayOf = (iso) => String(iso || '').slice(0, 10);
const toMs = (v) => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; };

/** The id a followed thing has: its kind and its reference. */
export const watchId = (kind, ref) => `${kind}:${ref}`;

/* ---- the rules (pure) ---- */

/** The item with Carta's new measurement { at, eur } appended, or the same
 *  item when it adds nothing. */
export function appendPoint(item, point) {
  const eur = Number(point?.eur);
  if (!item || !Number.isFinite(eur) || eur <= 0 || !toMs(point.at)) return item;
  const pts = item.pts || [];
  const last = pts[pts.length - 1];
  if (last && last.eur === eur && dayOf(last.at) === dayOf(point.at)) return item;
  if (last && toMs(point.at) < toMs(last.at)) return item;
  let next = [...pts, { at: point.at, eur }];
  if (next.length > MAX_POINTS) next = [next[0], ...next.slice(next.length - MAX_POINTS + 1)];
  return { ...item, pts: next, at: toMs(point.at) };
}

/** Euros moved since the traveller started following: negative is cheaper.
 *  Null without a point. */
export function deltaSinceStart(item) {
  const pts = item?.pts || [];
  if (!pts.length) return null;
  return Math.round((pts[pts.length - 1].eur - pts[0].eur) * 100) / 100;
}

/** The lowest price seen and when (its first time): { eur, at } or null. */
export function lowest(item) {
  const pts = item?.pts || [];
  return pts.reduce((lo, p) => (!lo || p.eur < lo.eur ? p : lo), null);
}

/** The latest price: { eur, at } or null. */
export const latest = (item) => (item?.pts?.length ? item.pts[item.pts.length - 1] : null);

/* ---- the device store ---- */

export const browserStorage = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export function readWatchState(storage = browserStorage()) {
  try {
    const raw = JSON.parse(storage?.getItem(WATCH_KEY) || 'null');
    return raw && raw.v === 1 && raw.items && typeof raw.items === 'object'
      ? { ...empty(), ...raw, removed: raw.removed || {} } : empty();
  } catch { return empty(); }
}

export function writeWatchState(storage = browserStorage(), state) {
  try { storage?.setItem(WATCH_KEY, JSON.stringify(state)); } catch { /* private mode */ }
  if (typeof window !== 'undefined' && storage === browserStorage()) {
    try { window.dispatchEvent(new Event(EVENT)); } catch { /* old browser */ }
  }
}

/** Followed items, most recently started first. */
export function listWatched(storage = browserStorage()) {
  const { items } = readWatchState(storage);
  return Object.values(items).sort((a, b) => toMs(b.pts?.[0]?.at) - toMs(a.pts?.[0]?.at));
}

export const isWatched = (id, storage = browserStorage()) => !!readWatchState(storage).items[id];

/** Start following: the first point is today's price when there is one. */
export function watch(item, { storage = browserStorage(), now = Date.now() } = {}) {
  if (!item?.ref || !WATCH_KINDS.includes(item.kind)) return null;
  const st = readWatchState(storage);
  const id = watchId(item.kind, item.ref);
  if (st.items[id]) return st.items[id];
  let next = {
    id, kind: item.kind, ref: item.ref, label: item.label || '', placeKey: item.placeKey || null,
    unitNote: item.unitNote || '', source: item.source || '', pts: [], alert: !!item.alert, at: now,
  };
  if (Number.isFinite(item.eur)) next = appendPoint(next, { at: new Date(now).toISOString(), eur: item.eur });
  st.items[id] = { ...next, at: now };
  delete st.removed[id];
  writeWatchState(storage, st);
  return st.items[id];
}

/** Stop following; the tombstone tells the account. */
export function unwatch(id, { storage = browserStorage(), now = Date.now() } = {}) {
  const st = readWatchState(storage);
  if (!st.items[id]) return;
  delete st.items[id];
  st.removed[id] = now;
  writeWatchState(storage, st);
}

/** Carta measured a price for a followed thing (the place re-priced, the
 *  stay price or the flight sweep changed). True when a point was added. */
export function recordPrice(id, point, { storage = browserStorage() } = {}) {
  const st = readWatchState(storage);
  const it = st.items[id];
  if (!it) return false;
  const next = appendPoint(it, point);
  if (next === it) return false;
  st.items[id] = next;
  writeWatchState(storage, st);
  return true;
}

export function setWatchAlert(id, on, { storage = browserStorage(), now = Date.now() } = {}) {
  const st = readWatchState(storage);
  if (!st.items[id]) return;
  st.items[id] = { ...st.items[id], alert: !!on, at: now };
  writeWatchState(storage, st);
}

/** The ?savedmock seam's items, written once with their histories (dev only). */
export function seedWatch(items, { storage = browserStorage() } = {}) {
  const st = readWatchState(storage);
  if (Object.keys(st.items).length) return;
  items.forEach((it) => { st.items[it.id] = { ...it, at: toMs(it.pts?.[it.pts.length - 1]?.at) }; });
  writeWatchState(storage, st);
}

/** Re-read on any change, here or in another tab. Returns the unsubscribe. */
export function subscribeWatch(fn) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => { if (!e.key || e.key === WATCH_KEY) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', onStorage); };
}

/* ---- the account (pure merge, then the sync) ---- */

const mergePts = (a = [], b = []) => {
  const seen = new Set();
  return [...a, ...b].filter((p) => {
    const k = `${p.at}|${p.eur}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((x, y) => toMs(x.at) - toMs(y.at));
};

/** Merge the device's items with the account's rows. The newer `at` wins
 *  an item's fields and a removal; the points of both copies are kept, as
 *  each is a price Carta really measured. Returns { state, rows }. */
export function mergeWatch(local, remoteRows, userId) {
  const st = local.owner && local.owner !== userId
    ? { v: 1, owner: userId, items: {}, removed: {} }
    : { ...local, owner: userId, items: { ...local.items }, removed: { ...local.removed } };
  const remote = new Map();
  for (const r of remoteRows || []) {
    if (r.kind !== WATCH_KIND) continue;
    const at = r.deleted_at ? toMs(r.deleted_at) : (Number(r.body?.at) || toMs(r.updated_at));
    remote.set(r.item_id, { item: r.deleted_at ? null : { ...r.body, id: r.item_id }, at });
  }
  const rows = [];
  const row = (id, item, at) => ({
    user_id: userId, kind: WATCH_KIND, item_id: id, body: item || {},
    updated_at: new Date(at).toISOString(), deleted_at: item ? null : new Date(at).toISOString(),
  });
  const ids = new Set([...Object.keys(st.items), ...Object.keys(st.removed), ...remote.keys()]);
  for (const id of ids) {
    const mine = st.items[id] ? { item: st.items[id], at: st.items[id].at || 0 }
      : st.removed[id] ? { item: null, at: st.removed[id] } : null;
    const theirs = remote.get(id) || null;
    if (mine?.item && theirs?.item) {
      const top = mine.at >= theirs.at ? mine.item : theirs.item;
      const merged = { ...top, pts: mergePts(mine.item.pts, theirs.item.pts), at: Math.max(mine.at, theirs.at) };
      st.items[id] = merged;
      if (JSON.stringify(merged) !== JSON.stringify({ ...theirs.item, id })) rows.push(row(id, merged, merged.at));
    } else if (mine && (!theirs || mine.at > theirs.at)) {
      if (!theirs && !mine.item) { delete st.removed[id]; continue; }
      rows.push(row(id, mine.item, mine.at));
      if (!mine.item) delete st.removed[id];
    } else if (theirs) {
      if (theirs.item) st.items[id] = theirs.item; else delete st.items[id];
      delete st.removed[id];
    }
  }
  return { state: st, rows };
}

const off = new Set();

/** One sync with the account. Never throws; a project without 076 stops
 *  trying for this page load. */
export async function syncWatch({ userId, storage = browserStorage(), cloud }) {
  if (!userId || !cloud || off.has(userId)) return { ok: false };
  try {
    const remote = await cloud.fetch(userId);
    const { state, rows } = mergeWatch(readWatchState(storage), remote, userId);
    await cloud.upsert(rows);
    writeWatchState(storage, state);
    return { ok: true, pushed: rows.length };
  } catch (err) {
    if (OFF_CODES.includes(err?.code)) off.add(userId);
    return { ok: false, error: err?.code || String(err?.message || err) };
  }
}

/** Test seam. */
export function resetWatchSyncForTests() { off.clear(); }
