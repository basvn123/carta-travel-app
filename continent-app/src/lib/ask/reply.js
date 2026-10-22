/*
 * Ask Carta's reply, kept short (T583, owner 2026-10-22: "more simple, more
 * clean, less scroll", "Short answer, then ask"). Pure helpers for the chat
 * turn: the written answer cut to its first few sentences, one plain line
 * when no written answer came, the pace of the word-by-word reveal, and the
 * quick replies that ask "Got one in mind?" with the places themselves.
 *
 *   trimSentences(sentences, max)   first `max` sentences (objects or a string)
 *   replyText(sentences, max)       those sentences as one string, no [n] marks
 *   shortLine(cities, { t, lang })  "Ohrid, Bitola and Struga look like a good fit."
 *   revealPace(words, opts)         ms per word, so a long answer ends under ~1.4 s
 *   placeChips(picks, n)            [{ id, city }] for the first n places
 */
export const SHOWN_PLACES = 3;
export const MAX_SENTENCES = 3;
/** The typing bubble shows at least this long, so a cached answer never snaps in. */
export const MIN_TYPING_MS = 750;
/** An answer slower than this shows its real steps instead of the bubble. */
export const SLOW_MS = 2500;

const CITE = /\s*\[\d+\]/g;

/** The first `max` sentences. A string is split at its full stops. */
export function trimSentences(sentences, max = MAX_SENTENCES) {
  if (!sentences) return [];
  if (typeof sentences === 'string') {
    return sentences.replace(CITE, '').trim().split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean).slice(0, max);
  }
  return sentences.slice(0, max);
}

/** The kept sentences as one paragraph, without the note marks. */
export function replyText(sentences, max = MAX_SENTENCES) {
  return trimSentences(sentences, max)
    .map((s) => String(typeof s === 'string' ? s : s?.text || '').replace(CITE, '').trim())
    .filter(Boolean)
    .join(' ');
}

/** One plain sentence naming the places, for when no written answer came. */
export function shortLine(cities, { t, lang = 'en' }) {
  const list = (cities || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return t('askChat.short.one', { place: list[0] });
  let places;
  try {
    places = new Intl.ListFormat(lang, { type: 'conjunction' }).format(list);
  } catch {
    places = list.join(', ');
  }
  return t('askChat.short.many', { places });
}

/** Milliseconds per word: about 30, faster for a long answer, never under 8. */
export function revealPace(words, { perWord = 30, maxMs = 1400, floor = 8 } = {}) {
  const n = Math.max(1, Number(words) || 0);
  return Math.max(floor, Math.min(perWord, Math.floor(maxMs / n)));
}

/** The quick replies for "Got one in mind?": the first places by name. */
export function placeChips(picks, n = SHOWN_PLACES) {
  const out = [];
  const seen = new Set();
  for (const p of picks || []) {
    const id = p?.id;
    const city = p?.dest?.city || p?.city;
    if (!id || !city || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, city });
    if (out.length >= n) break;
  }
  return out;
}
