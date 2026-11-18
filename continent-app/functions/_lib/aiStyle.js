/**
 * The traveller's travel style, as a model hears it (G12, Style Studio).
 *
 * The app sends the active style as enum values only (styleForAi in
 * continent-app/src/lib/travelStyles.js): no name and no free text, so
 * nothing a traveller typed can ride into a prompt this way. This module is
 * the server side of that contract: readAiStyle keeps only known values
 * (an unknown one is dropped, never guessed) and caps every list, and
 * aiStyleLines turns what is left into at most one head and three short
 * lines from the prompt registry (prompts/travel-style).
 *
 * Two identical copies, like prompts.js: supabase/functions/_shared/aiStyle.mjs
 * (the Edge Functions) and continent-app/functions/_lib/aiStyle.js (Pages
 * Functions and the app). continent-app/tests/aiStyle.test.mjs keeps them equal.
 */
import { frag, travelStyle as P } from './prompts.js';

/** The values a style field may hold; the same lists lib/travelStyles.js keeps. */
export const AI_STYLE_ENUMS = {
  stay: ['dorm', 'private', 'home', 'room', 'hotel2', 'hotel3', 'hotel4', 'hotel5'],
  priority: ['price', 'balance', 'comfort'],
  way: ['any', 'plane', 'train', 'bus', 'car'],
  ways: ['plane', 'train', 'bus', 'car'],
  likes: ['beach', 'hiking', 'lakes', 'culture', 'city', 'food', 'nightlife', 'hidden', 'cycling', 'ski', 'wellness', 'islands'],
  avoid: ['crowds', 'transfers', 'heat'],
  shapes: ['one', 'towns', 'road', 'countries'],
  size: ['city', 'town', 'village', 'mix'],
  quiet: ['quiet', 'lively'],
  around: ['public', 'taxi', 'car', 'mix'],
  mornings: ['early', 'onthego', 'slow'],
  pace: ['slow', 'balanced', 'packed'],
};
// The style keeps three likes; the other lists are short by nature, the cap
// only stops a crafted payload from growing a line.
const LIST_CAPS = { ways: 4, likes: 3, avoid: 3, shapes: 4 };
const SCALARS = ['stay', 'priority', 'way', 'size', 'quiet', 'around', 'mornings', 'pace'];

const count = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/**
 * The style from a request body, checked: a plain object with only known
 * values, or null when nothing usable is left. Never throws.
 */
export function readAiStyle(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  const p = raw.party;
  if (p && typeof p === 'object') {
    const adults = count(p.adults, 1, 20);
    if (adults != null) {
      out.party = { adults, kids: count(p.kids, 0, 19) ?? 0, babies: count(p.babies, 0, 10) ?? 0 };
    }
  }
  for (const k of SCALARS) {
    if (AI_STYLE_ENUMS[k].includes(raw[k])) out[k] = raw[k];
  }
  for (const [k, cap] of Object.entries(LIST_CAPS)) {
    if (!Array.isArray(raw[k])) continue;
    const list = [...new Set(raw[k].filter((x) => AI_STYLE_ENUMS[k].includes(x)))].slice(0, cap);
    if (list.length) out[k] = list;
  }
  if (out.way === 'any') delete out.way;
  return Object.keys(out).length ? out : null;
}

let words = null;
const W = () => (words ||= JSON.parse(P.f.words));

/** "a", "a and b", "a, b and c". */
function joined(list, word) {
  if (list.length < 2) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`;
}

function partyWords(party) {
  const w = W().party;
  const one = (n, single, many) => (n === 1 ? w[single] : w[many].replace('{n}', String(n)));
  const parts = [one(party.adults, 'adult', 'adults')];
  if (party.kids) parts.push(one(party.kids, 'child', 'children'));
  if (party.babies) parts.push(one(party.babies, 'baby', 'babies'));
  return joined(parts, W().and);
}

/**
 * The prompt lines for a checked style (readAiStyle), or [] when there is
 * none. `head` is 'ask' or 'plan': which caller's opening line. At most the
 * head and three lines, each only when the style says something for it.
 */
export function aiStyleLines(style, head) {
  const s = readAiStyle(style);
  if (!s) return [];
  const w = W();
  const lines = [];

  const trip = [];
  if (s.party) trip.push(partyWords(s.party));
  if (s.stay) trip.push(w.stay[s.stay]);
  if (s.priority) trip.push(w.priority[s.priority]);
  // The main way first: the traveller's order is their preference.
  const ways = s.ways || (s.way ? [s.way] : []);
  const ordered = s.way && ways.includes(s.way) ? [s.way, ...ways.filter((x) => x !== s.way)] : ways;
  if (ordered.length) trip.push(frag(P, 'ways', { list: joined(ordered.map((x) => w.way[x]), w.or) }));
  if (s.shapes) trip.push(joined(s.shapes.map((x) => w.shapes[x]), w.or));
  if (trip.length) lines.push(frag(P, 'trip', { items: trip.join(', ') }));

  const likes = s.likes ? joined(s.likes.map((x) => w.likes[x]), w.and) : '';
  const avoid = s.avoid ? joined(s.avoid.map((x) => w.avoid[x]), w.and) : '';
  if (likes && avoid) lines.push(frag(P, 'taste', { likes, avoid }));
  else if (likes) lines.push(frag(P, 'likes', { likes }));
  else if (avoid) lines.push(frag(P, 'avoid', { avoid }));

  const days = [];
  if (s.size) days.push(w.size[s.size]);
  if (s.quiet) days.push(w.quiet[s.quiet]);
  if (s.around) days.push(w.around[s.around]);
  if (s.mornings) days.push(w.mornings[s.mornings]);
  if (s.pace) days.push(w.pace[s.pace]);
  if (days.length) lines.push(frag(P, 'days', { items: days.join(', ') }));

  if (!lines.length) return [];
  return [frag(P, head === 'plan' ? 'plan.head' : 'ask.head'), ...lines];
}

/** The checked style as a stable string for a cache key, or null. */
export function aiStyleKey(style) {
  const s = readAiStyle(style);
  if (!s) return null;
  const out = {};
  for (const k of Object.keys(s).sort()) {
    out[k] = Array.isArray(s[k]) && k !== 'ways' ? [...s[k]].sort() : s[k];
  }
  return JSON.stringify(out);
}
