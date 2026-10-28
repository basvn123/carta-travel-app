/**
 * The traveller's taste profile (Carta rating v5, Layer 3): who usually
 * comes, what they go for, where they like to stay and how they travel. It
 * lives in `choices.taste`, so it rides the local storage of lib/urlState.js
 * and, signed in, `user_settings.settings` (hooks/useAccountSync.js).
 *
 *   { party, likes[] (up to 3, from LIKES), size, quiet, lifestyle, noCar,
 *     asked: { [facet]: 'yes' | 'no' } }
 *
 * Every question has "No preference", stored as null (or an empty list),
 * which gives that dimension weight 0 in lib/match.js. Pure: reading,
 * writing and merging only, so the sign-in merge is unit-tested.
 */
import { LIKES, PARTY_KINDS } from '../planner/flow/tripSettings.js';

export const MAX_LIKES = 3;
/** Where do you like to stay: big cities, towns, villages and countryside, a mix. */
export const SIZES = Object.freeze(['city', 'town', 'village', 'mix']);
/** Lively or quiet. */
export const QUIET = Object.freeze(['quiet', 'lively']);
export const PARTIES = Object.freeze(Object.keys(PARTY_KINDS));

const oneOf = (v, list) => (list.includes(v) ? v : null);

/** A taste with nothing answered. */
export function emptyTaste() {
  return { party: null, likes: [], size: null, quiet: null, lifestyle: null, noCar: null, asked: {} };
}

/** A clean taste from anything stored (an old shape, a bad link, null). */
export function normalizeTaste(raw) {
  const out = emptyTaste();
  if (!raw || typeof raw !== 'object') return out;
  out.party = oneOf(raw.party, PARTIES);
  out.likes = Array.isArray(raw.likes)
    ? [...new Set(raw.likes.filter((k) => LIKES.includes(k)))].slice(0, MAX_LIKES)
    : [];
  out.size = oneOf(raw.size, SIZES);
  out.quiet = oneOf(raw.quiet, QUIET);
  out.lifestyle = typeof raw.lifestyle === 'string' && /^[a-z_]{1,24}$/.test(raw.lifestyle) ? raw.lifestyle : null;
  out.noCar = raw.noCar === true ? true : null;
  if (raw.asked && typeof raw.asked === 'object') {
    for (const [k, v] of Object.entries(raw.asked)) {
      if (LIKES.includes(k) && (v === 'yes' || v === 'no')) out.asked[k] = v;
    }
  }
  return out;
}

/**
 * The taste one trip ranks with (T766, "Help me choose"): the saved taste with
 * the trip's own likes in its place, when the trip named any. The saved
 * profile is not changed; "Save as my travel style" writes it, on a tap.
 */
export function tripTaste(saved, tripLikes) {
  const base = normalizeTaste(saved);
  const likes = Array.isArray(tripLikes) ? tripLikes.filter((k) => LIKES.includes(k)) : [];
  return likes.length ? normalizeTaste({ ...base, likes }) : base;
}

/** True when the trip's likes differ from the saved taste's (the save offer shows). */
export function tripLikesDiffer(saved, tripLikes) {
  const a = normalizeTaste(saved).likes;
  const b = tripTaste(saved, tripLikes).likes;
  return b.length > 0 && (a.length !== b.length || a.some((k, i) => k !== b[i]));
}

/** True when nothing is answered at all (the chip asks "Tell Carta what you like"). */
export function isEmptyTaste(raw) {
  const t = normalizeTaste(raw);
  return !t.party && !t.likes.length && !t.size && !t.quiet && !t.lifestyle && !t.noCar;
}

/** True when the taste says something the match can weigh (likes, size, quiet). */
export function hasMatchSignal(raw) {
  const t = normalizeTaste(raw);
  return t.likes.length > 0 || (t.size != null && t.size !== 'mix') || t.quiet != null;
}

/** A copy with one answer set; null is "No preference". */
export function setTasteAnswer(raw, key, value) {
  const t = normalizeTaste(raw);
  if (key === 'likes') t.likes = Array.isArray(value) ? value : [];
  else if (key in t && key !== 'asked') t[key] = value;
  return normalizeTaste(t);
}

/** Add or drop one like; a fourth pick is refused (the list stays at three). */
export function toggleLike(raw, like) {
  const t = normalizeTaste(raw);
  if (t.likes.includes(like)) t.likes = t.likes.filter((k) => k !== like);
  else if (t.likes.length < MAX_LIKES && LIKES.includes(like)) t.likes = [...t.likes, like];
  return t;
}

/** Remember the answer to a learning question, so a no is never asked again. */
export function recordAsked(raw, facet, yes) {
  const t = normalizeTaste(raw);
  t.asked = { ...t.asked, [facet]: yes ? 'yes' : 'no' };
  if (yes && !t.likes.includes(facet) && t.likes.length < MAX_LIKES) t.likes = [...t.likes, facet];
  return normalizeTaste(t);
}

const isSet = (k, v) => (k === 'likes' ? Array.isArray(v) && v.length > 0 : v != null);

/**
 * The sign-in merge: a local taste the account does not have is kept, and
 * the account wins key by key. `asked` merges per facet, the account's
 * answer winning, so a no given on either device holds.
 */
export function mergeTaste(local, account) {
  const l = normalizeTaste(local);
  const a = normalizeTaste(account);
  const out = emptyTaste();
  for (const k of ['party', 'likes', 'size', 'quiet', 'lifestyle', 'noCar']) {
    out[k] = isSet(k, a[k]) ? a[k] : l[k];
  }
  out.asked = { ...l.asked, ...a.asked };
  return normalizeTaste(out);
}

/**
 * The sign-in merge on the whole `choices` blob (hooks/useAccountSync.js):
 * every other choice keeps its old rule (the account's copy wins), and the
 * taste merges key by key through mergeTaste, so a taste set on this device
 * before signing in survives where the account says nothing.
 */
export function mergeAccountChoices(local, incoming) {
  const out = { ...(local || {}), ...(incoming || {}) };
  out.taste = mergeTaste(local?.taste, incoming?.taste);
  return out;
}

/** True when the merged taste says more than the account's copy, so it must be written back. */
export function tasteNeedsWriteBack(local, account) {
  return !sameTaste(mergeTaste(local, account), account);
}

/** The key a Lifestyle preset is kept under: "Cafe & culture" is "cafe_culture". */
export function lifestyleKey(name) {
  if (typeof name !== 'string') return null;
  const k = name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  return k || null;
}

/**
 * The chip's words (Explore header, Account): at most `max` summary keys and
 * how many more there are. A taste that names only who comes, or only the
 * Lifestyle preset, reads as that ("For you: family"), so a set taste never
 * shows an empty chip. The preset's word is the Lifestyle panel's own
 * (lifestyle.profileCafeCulture for cafe_culture).
 */
export function tasteChipWords(raw, max = 3) {
  const t = normalizeTaste(raw);
  let keys = tasteSummaryKeys(t);
  if (!keys.length && t.party) keys = [`taste.party.${t.party}`];
  if (!keys.length && t.lifestyle) {
    keys = [`lifestyle.profile${t.lifestyle.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`];
  }
  return { keys: keys.slice(0, max), more: Math.max(0, keys.length - max) };
}

/** The words as one list ("hiking, villages, quiet +1"), or '' with nothing set. `t` is the i18n lookup. */
export function tasteListText(raw, t) {
  const { keys, more } = tasteChipWords(raw);
  if (!keys.length) return '';
  const list = keys.map((k) => t(k)).join(', ');
  return more ? t('taste.listMore', { list, n: more }) : list;
}

/** The Explore header chip: "For you: hiking, villages, quiet", or the invitation with nothing set. */
export function tasteChipText(raw, t) {
  const { keys, more } = tasteChipWords(raw);
  if (!keys.length) return t('taste.chipEmpty');
  const list = keys.map((k) => t(k)).join(', ');
  return more ? t('taste.chipMore', { list, n: more }) : t('taste.chip', { list });
}

/** True when two tastes say the same thing. */
export function sameTaste(x, y) {
  return JSON.stringify(normalizeTaste(x)) === JSON.stringify(normalizeTaste(y));
}

/**
 * The words of the chip, as i18n keys in order: the likes, then the size,
 * then quiet or lively ("hiking, villages, quiet").
 */
export function tasteSummaryKeys(raw) {
  const t = normalizeTaste(raw);
  const keys = t.likes.map((k) => `taste.like.${k}`);
  if (t.size && t.size !== 'mix') keys.push(`taste.size.${t.size}`);
  if (t.quiet) keys.push(`taste.quiet.${t.quiet}`);
  if (t.noCar) keys.push('taste.noCarShort');
  return keys;
}

/**
 * The compact form for a link or local storage:
 * "p=family;l=hiking.lakes;s=village;q=quiet;ls=foodie;nc=1;a=lakes:n".
 */
export function encodeTaste(raw) {
  const t = normalizeTaste(raw);
  const parts = [];
  if (t.party) parts.push(`p=${t.party}`);
  if (t.likes.length) parts.push(`l=${t.likes.join('.')}`);
  if (t.size) parts.push(`s=${t.size}`);
  if (t.quiet) parts.push(`q=${t.quiet}`);
  if (t.lifestyle) parts.push(`ls=${t.lifestyle}`);
  if (t.noCar) parts.push('nc=1');
  const asked = Object.entries(t.asked).map(([k, v]) => `${k}:${v === 'yes' ? 'y' : 'n'}`);
  if (asked.length) parts.push(`a=${asked.join('.')}`);
  return parts.join(';');
}

/** The reverse of encodeTaste; anything unreadable is dropped. */
export function decodeTaste(s) {
  const raw = { likes: [], asked: {} };
  if (typeof s !== 'string' || !s) return normalizeTaste(raw);
  for (const part of s.split(';')) {
    const [k, v = ''] = part.split('=');
    if (k === 'p') raw.party = v;
    else if (k === 'l') raw.likes = v.split('.');
    else if (k === 's') raw.size = v;
    else if (k === 'q') raw.quiet = v;
    else if (k === 'ls') raw.lifestyle = v;
    else if (k === 'nc') raw.noCar = v === '1';
    else if (k === 'a') {
      for (const pair of v.split('.')) {
        const [f, a] = pair.split(':');
        if (f) raw.asked[f] = a === 'y' ? 'yes' : 'no';
      }
    }
  }
  return normalizeTaste(raw);
}

// A saved place counts towards a facet when it sits in the top fifth of the
// catalogue for it (the profile values are frozen percentiles).
const LEARN_MIN_VALUE = 0.8;
export const LEARN_MIN_SAVES = 5;

/**
 * The learning question: the facet the traveller did not pick that at least
 * five saved places share, or null. A facet already asked (yes or no) is
 * never offered again. `saved` is the list of saved place records.
 */
export function learnFacet(raw, saved) {
  const t = normalizeTaste(raw);
  if (t.likes.length >= MAX_LIKES || !Array.isArray(saved)) return null;
  const counts = {};
  for (const p of saved) {
    const likes = p?.taste?.likes;
    if (!likes) continue;
    for (const k of LIKES) {
      const v = Array.isArray(likes[k]) ? likes[k][0] : null;
      if (v != null && v >= LEARN_MIN_VALUE) counts[k] = (counts[k] || 0) + 1;
    }
  }
  let best = null;
  for (const k of LIKES) {
    if (t.likes.includes(k) || t.asked[k]) continue;
    if ((counts[k] || 0) >= LEARN_MIN_SAVES && (!best || counts[k] > counts[best])) best = k;
  }
  return best;
}
