/*
 * Ask Carta, stage 6: the check every written sentence passes before it
 * shows (T556). A small model can be fluent and wrong; this is what keeps
 * the written answer to the notes it was given:
 *
 *   - a sentence cites at least one note, and only notes that exist
 *   - every figure in it is written in a note (or in the question)
 *   - every catalogue place it names is in the notes
 *   - no dash survives (stripDashes), no reasoning block survives
 *
 * A failing sentence is dropped. When more than WITHDRAW of the sentences
 * fail, or none pass, the written answer is withdrawn and the facts answer
 * stays. Pure; runs in the browser on the stream and in node tests.
 */
import { stripDashes } from '../format.js';
import { foldName } from '../searchIndex.js';

export const WITHDRAW = 0.3;

/** The text with any <think> block and stray markup taken out. */
export function cleanModelText(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/[*#_`]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '');
}

/**
 * Whole sentences, each with its citations. "It rains less. [2]" and "It
 * rains less [2]." read the same. A sentence still being written (no end
 * mark yet) is returned as `tail` and checked once it is finished. While
 * the text still streams (`final` false) an end mark at the very end does
 * not close a sentence yet: "~€87 est." may go on "a day".
 */
export function splitSentences(text, final = true) {
  const s = cleanModelText(text).replace(/([.!?])\s*((?:\[\d+\]\s*)+)/g, ' $2$1 ');
  const out = [];
  // A sentence ends at an end mark followed by a space or the end, so the
  // dot in "9.1" or "~€87 est. a day" mid-figure never cuts one in two.
  const ends = [];
  for (let i = 0; i < s.length; i++) {
    if (!'.!?'.includes(s[i])) continue;
    const after = s.slice(i + 1);
    // Mid-stream, an end mark closes a sentence only once the next word has
    // begun: "~€87 est." may still go on "a day", "[2" may still become "[2]".
    const closed = final ? (after === '' || /^\s/.test(after)) : /^\s+\S/.test(after);
    if (closed) {
      if (s[i] === '.' && /\best$/i.test(s.slice(0, i)) && /^\s+\p{Ll}/u.test(after)) continue;
      ends.push(i + 1);
    }
  }
  let last = 0;
  for (const end of ends) {
    const raw = s.slice(last, end).trim();
    last = end;
    if (!raw) continue;
    const cites = [...raw.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1]));
    const body = raw.replace(/\s*\[\d+\]/g, '').replace(/\s+([.!?,;:])/g, '$1').replace(/\s+/g, ' ').trim();
    if (body.replace(/[.!?]/g, '').trim()) out.push({ text: body, cites });
  }
  return { sentences: out, tail: s.slice(last).trim() };
}

const digits = (s) => String(s).replace(/(\d)[.,\s'](?=\d{3}\b)/g, '$1');
const figuresOf = (s) => (digits(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));

/**
 * The checker for one pack.
 *
 *   pack         context.js buildPack()
 *   knownPlaces  every catalogue city name ([name]), to catch a place the
 *                notes never mention
 */
export function makeChecker(pack, knownPlaces = []) {
  const noteText = pack.notes.map((n) => n.text).join(' ');
  const allowedFigures = new Set([...figuresOf(noteText), ...figuresOf(pack.question)]);
  const allowedText = foldName(`${noteText} ${pack.question}`);
  // Names of two letters or more that start with a capital, written as the
  // catalogue writes them; a name the notes or the question carry is fine.
  const watch = [...new Set(knownPlaces)]
    .map((n) => String(n || '').replace(/\s*\(.*\)$/, '').trim())
    .filter((n) => n.length >= 4 && /^\p{Lu}/u.test(n) && !allowedText.includes(foldName(n)));
  const watchRe = watch.length
    ? new RegExp(`(?:^|[^\\p{L}])(${watch.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}])`, 'u')
    : null;
  return function check(sentence) {
    const why = [];
    if (!sentence.cites.length) why.push('nocite');
    if (sentence.cites.some((c) => c < 1 || c > pack.notes.length)) why.push('badcite');
    for (const f of figuresOf(sentence.text)) {
      if (!allowedFigures.has(f)) { why.push(`figure:${f}`); break; }
    }
    const hit = watchRe ? sentence.text.match(watchRe) : null;
    if (hit) why.push(`place:${hit[1]}`);
    return { text: stripDashes(sentence.text), cites: sentence.cites, ok: why.length === 0, why };
  };
}

/**
 * The whole written answer checked: the sentences that pass, the ones that
 * did not (for the report and tests), and whether to withdraw it.
 */
export function verifyAnswer(text, pack, knownPlaces = []) {
  const check = makeChecker(pack, knownPlaces);
  const { sentences } = splitSentences(text);
  const checked = sentences.map(check);
  const kept = checked.filter((s) => s.ok);
  const failed = checked.filter((s) => !s.ok);
  const withdrawn = !kept.length || failed.length / Math.max(1, checked.length) > WITHDRAW;
  return { kept, failed, withdrawn, total: checked.length };
}
