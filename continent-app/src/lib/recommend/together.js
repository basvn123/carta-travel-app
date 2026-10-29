/**
 * Decide together (TF4, T808): a shortlist of kept trips shared as one link.
 * Each person who opens it keeps or skips each trip and sends the link on
 * with their picks in it; the trips everyone kept rise to the top.
 *
 * The whole shortlist rides in the link's hash (#together=...), which never
 * reaches a server: no account, no table, no co-planner invite needed, so a
 * guest can take part. People are numbers in the order they joined, never
 * names. Pure, except the link helpers at the end. App reads the hash
 * itself, so its first load carries none of this.
 *
 *   { trips: [{ id, name, country, iso2, image, nights, month, dates,
 *               total: { perPerson }, party: { head } }],
 *     people: [{ keep: [id], skip: [id] }] }
 */
import { TOGETHER_HASH } from './keptStore.js';

export { TOGETHER_HASH };
export const MAX_TRIPS = 8;
export const MAX_PEOPLE = 8;
const VERSION = 1;

const toB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (code) => {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? v : null);
const ids = (v, known) => (Array.isArray(v) ? [...new Set(v.filter((x) => known.has(x)))] : []);

/** The shortlist's own id: its trips, in any order. */
export function listId(trips) {
  const text = trips.map((x) => x.id).sort().join('|');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** A kept record (keptStore) as the link carries it. */
function slim(r) {
  return {
    id: r.id, n: r.name || '', c: r.country || '', i: r.iso2 || '', g: r.image || '',
    ni: r.nights ?? null, m: r.month ?? null, d: r.dates ? [r.dates.out, r.dates.back] : null,
    p: r.total?.perPerson ?? null, h: r.party?.head ?? 1,
  };
}

function unslim(x) {
  return {
    id: str(x.id, 80), name: str(x.n), country: str(x.c, 80), iso2: str(x.i, 2), image: str(x.g, 600) || null,
    nights: num(x.ni), month: num(x.m), dates: Array.isArray(x.d) && x.d.length === 2 ? { out: str(x.d[0], 10), back: str(x.d[1], 10) } : null,
    total: { perPerson: num(x.p) }, party: { head: num(x.h) || 1 },
  };
}

/** A new shortlist from kept trips: the sender is person 1 and kept them all. */
export function startTogether(records) {
  const trips = records.slice(0, MAX_TRIPS);
  return { trips: trips.map((r) => unslim(slim(r))), people: [{ keep: trips.map((r) => r.id), skip: [] }] };
}

export function encodeTogether({ trips, people }) {
  return toB64(JSON.stringify({ v: VERSION, t: trips.map(slim), p: people.map((x) => [x.keep, x.skip]) }));
}

/** The shortlist in a link, or null for anything that is not one. */
export function decodeTogether(code) {
  try {
    const raw = JSON.parse(fromB64(String(code || '')));
    if (raw?.v !== VERSION || !Array.isArray(raw.t) || !Array.isArray(raw.p)) return null;
    const trips = raw.t.slice(0, MAX_TRIPS).map(unslim).filter((x) => x.id);
    if (trips.length < 2) return null;
    const known = new Set(trips.map((x) => x.id));
    const people = raw.p.slice(0, MAX_PEOPLE).map((x) => ({ keep: ids(x?.[0], known), skip: ids(x?.[1], known) }));
    return { trips, people };
  } catch {
    return null;
  }
}

/**
 * One person's pick on one trip: 'keep', 'skip' or null (no pick). `me` is
 * their number in the list; a newcomer (me = people.length) joins here.
 */
export function vote(people, me, id, choice) {
  const next = people.map((x) => ({ keep: [...x.keep], skip: [...x.skip] }));
  while (next.length <= me && next.length < MAX_PEOPLE) next.push({ keep: [], skip: [] });
  const p = next[me];
  if (!p) return people;
  p.keep = p.keep.filter((x) => x !== id);
  p.skip = p.skip.filter((x) => x !== id);
  if (choice === 'keep') p.keep.push(id);
  if (choice === 'skip') p.skip.push(id);
  return next;
}

/** What one person picked for one trip. */
export const pickOf = (people, me, id) => (people[me]?.keep.includes(id) ? 'keep' : people[me]?.skip.includes(id) ? 'skip' : null);

/**
 * The trips in the order to decide by: the ones everyone kept first, then
 * by how many kept them, then by fewest skips, then as they were shared.
 * Each comes with { keeps, skips, all } (all: every person kept it, with
 * more than one person in).
 */
export function standing({ trips, people }) {
  const voters = people.filter((x) => x.keep.length || x.skip.length).length;
  return trips
    .map((trip, i) => {
      const keeps = people.filter((x) => x.keep.includes(trip.id)).length;
      const skips = people.filter((x) => x.skip.includes(trip.id)).length;
      return { trip, keeps, skips, voters, all: voters > 1 && keeps === voters, i };
    })
    .sort((a, b) => (b.all - a.all) || (b.keeps - a.keeps) || (a.skips - b.skips) || (a.i - b.i));
}

/** The link to send: this page's address with the shortlist in the hash. */
export function togetherUrl(list, href = typeof window !== 'undefined' ? window.location.href : '') {
  return `${href.split('#')[0]}${TOGETHER_HASH}${encodeTogether(list)}`;
}

/**
 * Send the link: the device's share sheet where there is one, else the
 * clipboard. Resolves 'shared', 'copied', or null (closed or not possible:
 * the caller shows the link to copy by hand).
 */
export async function sendLink(url, title) {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ title, url }); return 'shared'; }
  } catch { return null; /* the traveller closed the share sheet */ }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return null;
  }
}
