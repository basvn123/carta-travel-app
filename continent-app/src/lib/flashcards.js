/**
 * Advisory flashcards (T167, spec C5).
 *
 * Good to know, pro tips and what could go wrong run as decks of small cards.
 * One idea per card, at most CARD_WORD_LIMIT words. The prose is compressed by
 * splitting, never by cutting: a long item becomes several cards in the order
 * it was written, so no warning is lost. Pure functions, no React.
 */

export const CARD_WORD_LIMIT = 35;
/** A sentence shorter than this is joined to its neighbour when both fit. */
const SHORT_SENTENCE = 8;

/** Words in a text, ignoring the ** bold markers the source prose carries. */
export function cardWords(text) {
  return String(text || '').replace(/\*\*/g, '').trim().split(/\s+/).filter(Boolean).length;
}

// A full stop after one of these is not the end of a sentence.
const ABBREV = /(?:\b(?:e\.g|i\.e|etc|vs|approx|ca|St|Mt|Dr|No|incl)\.)$/i;

function sentences(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])(?:\*\*)?\s+(?=[A-Z0-9"'(*€£])/);
  const out = [];
  for (const piece of raw) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out.filter(Boolean);
}

// Split one over-long sentence near its middle, preferring ; then : then a comma.
function splitLong(sentence, max) {
  if (cardWords(sentence) <= max) return [sentence];
  const words = sentence.split(' ');
  const mid = words.length / 2;
  let best = -1;
  for (const mark of [/[;]$/, /[:]$/, /,(?:\*\*)?$/]) {
    let dist = Infinity;
    words.forEach((w, i) => {
      if (i < 4 || i > words.length - 5) return;
      if (mark.test(w) && Math.abs(i - mid) < dist) { dist = Math.abs(i - mid); best = i; }
    });
    if (best >= 0) break;
  }
  if (best < 0) best = Math.floor(mid) - 1;
  const a = words.slice(0, best + 1).join(' ');
  const b = words.slice(best + 1).join(' ');
  return [...splitLong(a, max), ...splitLong(b, max)];
}

// Re-open and close ** across a split so a bold run never leaks onto the next card.
function balanceBold(chunks) {
  let carry = false;
  return chunks.map((c) => {
    let s = carry ? `**${c}` : c;
    const odd = (s.match(/\*\*/g) || []).length % 2 === 1;
    carry = odd;
    if (odd) s += '**';
    return s.replace(/\*\*\s*\*\*/g, '');
  });
}

/** One text into cards of at most `max` words each, in reading order. */
export function splitCards(text, max = CARD_WORD_LIMIT) {
  const parts = sentences(text).flatMap((s) => splitLong(s, max));
  const cards = [];
  for (const part of parts) {
    const last = cards[cards.length - 1];
    if (last !== undefined
      && (cardWords(last) < SHORT_SENTENCE || cardWords(part) < SHORT_SENTENCE)
      && cardWords(last) + cardWords(part) <= max) {
      cards[cards.length - 1] = `${last} ${part}`;
    } else cards.push(part);
  }
  return balanceBold(cards);
}

/** Category of a card from its words. `fallback` is the deck's own default. */
export function cardCategory(text, fallback) {
  const s = String(text || '').toLowerCase();
  if (/\b(rain|storm|snow|wind|thunder|fog|heat|hot|cold|freez|weather|forecast|temperature|ice|icy|monsoon)\b/.test(s)) return 'weather';
  if (/[€£$]|\b(euro|euros|eur|cash|atm|card|cards|fee|fees|fine|fined|price|prices|cost|costs|pay|paid|tipping|deposit|charge|charged|refund|cheaper|expensive)\b/.test(s)) return 'money';
  if (/\b(book|booked|booking|bookings|reserve|reserved|reservation|reservations|in advance|weeks ahead|sell out|sells out|sold out|deadline|opens|closes|closed|timetable|last (?:train|bus|ferry|boat)|before \d|by \d)\b/.test(s)) return 'timing';
  return fallback;
}

/**
 * Cards for one deck. `items` are { key, text, label?, fallback? }; each item
 * becomes one or more cards that keep its label and key. `fallback` decides the
 * icon when the words say nothing more specific.
 */
export function buildCards(items, fallback) {
  const cards = [];
  for (const item of items || []) {
    const parts = splitCards(item.text);
    parts.forEach((text, i) => {
      cards.push({
        key: `${item.key}-${i}`,
        text,
        label: item.label || '',
        icon: item.icon || null,
        category: item.category || cardCategory(text, item.fallback || fallback),
      });
    });
  }
  return cards;
}
