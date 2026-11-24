/*
 * Ask Carta, stage 6: the check every written sentence passes before it
 * shows (T556). A small model can be fluent and wrong; this is what keeps
 * the written answer to the notes it was given:
 *
 *   - a sentence cites at least one note, and only notes that exist
 *   - every figure in it is written in a note (or in the question)
 *   - every figure is written in a note the sentence CITES (or in the question)
 *     (A3: a right figure from the wrong note, place, day or trip is dropped)
 *   - every catalogue place it names is in the notes, and in a cited note
 *     or the question; a day it names ("day 2") is the day a cited note names
 *   - with the noFigures option no figure shows at all (batch prose, L3)
 *   - a comparison or a verdict ("cheaper", "drier", "best") cites a note
 *     the code wrote for it (kind 'cmp', context.js comparisonNotes, T563)
 *   - a figure the notes give only as an estimate keeps its "~"
 *   - no dash survives (stripDashes), no reasoning block survives
 *
 * A failing sentence is dropped. When more than WITHDRAW of the sentences
 * fail, or none pass, the written answer is withdrawn and the facts answer
 * stays. Pure; runs in the browser on the stream and in node tests.
 *
 * Residual, stated: a sentence that names no place or day and cites a note
 * that holds the same value by coincidence still passes (decision 2.1; the
 * planted eval reports its share, results.md of the wave 4 run).
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

// The words that compare or judge, in the six languages (folded). "Best
// months" and its kin are the notes' own phrase, not a verdict.
const COMPARE = new RegExp(`(?:^|[^\\p{L}])(${[
  'than', 'cheaper', 'pricier', 'dearer', 'drier', 'wetter', 'warmer', 'colder', 'cooler', 'hotter', 'higher', 'lower',
  'less', 'fewer', 'better', 'best', 'worse', 'worst', 'most', 'least', 'more expensive', 'more crowded', 'quieter', 'busier',
  'dan', 'goedkoper', 'duurder', 'droger', 'natter', 'kouder', 'hoger', 'lager', 'minder', 'beter', 'beste', 'drukker', 'rustiger',
  'gunstiger', 'billiger', 'teurer', 'trockener', 'warmer', 'kalter', 'hoher', 'niedriger', 'weniger', 'besser', 'beste', 'ruhiger',
  'moins cher', 'plus cher', 'plus sec', 'plus chaud', 'meilleur', 'meilleure', 'mieux', 'moins', 'plus calme',
  'mas barato', 'mas barata', 'mas caro', 'mas seco', 'mejor', 'peor', 'menos', 'mas tranquilo',
  'piu economico', 'piu economica', 'piu caro', 'piu secco', 'migliore', 'meglio', 'peggiore', 'meno', 'piu tranquillo',
].join('|')})(?=$|[^\\p{L}])`, 'u');
// "Best months", "best visited in May" and their kin are the notes' own
// season phrase, not a verdict on a place.
const NOT_A_VERDICT = new RegExp([
  'best(e)? (months|maanden|time|tijd|reisezeit|monate|season)', 'best (visited|in|from|between|during|enjoyed)',
  'am besten (im|von|zwischen|besucht)', 'het best(e)? (in|van|tussen|bezocht)', 'meilleurs mois', 'meilleure periode',
  'mejores meses', 'mejor epoca', 'mejor (en|de|entre)', 'mesi migliori', 'periodo migliore', 'meglio (a|da|tra|in)',
  'beste reistijd', 'beste reisezeit',
].join('|'), 'g');

// A day named in a sentence ("day 2", "Tag 3", "dag 2", "jour 2", "dia 2", "giorno 2"): the same
// label and number must be written in a cited note, or "day 2" under a day 3 note slips through
// on a "2" that happens to be a rain figure.
const DAY_LABEL = /(?:^|[^\p{L}])(day|dag|tag|jour|dia|giorno)\s+(\d{1,3})(?![\d.,]\d)/giu;

const hasName = (foldedText, name) => foldedText.includes(foldName(name));

/**
 * The checker for one pack.
 *
 *   pack         context.js buildPack()
 *   knownPlaces  every catalogue city name ([name]), to catch a place the
 *                notes never mention
 *   opts         { noFigures } the sentence may hold no figure at all (batch
 *                prose, and live Ask once its figures come from code, L3):
 *                a digit, a currency sign or a per cent outside a place name
 *                fails with `figure-free`
 *
 * The old whole-pack rules run first and keep their reasons (figure, place,
 * compare, estmark); the cited-note rules (A3, decision 2.1) add their own
 * reasons after them, so nothing the old checker failed can pass now.
 */
export function makeChecker(pack, knownPlaces = [], opts = {}) {
  const noteText = pack.notes.map((n) => n.text).join(' ');
  const allowedFigures = new Set([...figuresOf(noteText), ...figuresOf(pack.question)]);
  const allowedText = foldName(`${noteText} ${pack.question}`);
  // Names of two letters or more that start with a capital, written as the
  // catalogue writes them; a name the notes or the question carry is fine.
  const names = [...new Set(knownPlaces)]
    .map((n) => String(n || '').replace(/\s*\(.*\)$/, '').trim())
    .filter((n) => n.length >= 4 && /^\p{Lu}/u.test(n));
  const nameRe = (list) => (list.length
    ? new RegExp(`(?:^|[^\\p{L}])(${list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}])`, 'gu')
    : null);
  const watch = names.filter((n) => !allowedText.includes(foldName(n)));
  const watchRe = nameRe(watch);
  // The names the notes or the question do carry: such a name must sit in a note the sentence cites.
  const seenRe = nameRe(names.filter((n) => allowedText.includes(foldName(n))));
  let everyRe = null; // every name, only built for noFigures
  const cmpNotes = new Set(pack.notes.filter((n) => n.kind === 'cmp').map((n) => n.n));
  const noteFold = pack.notes.map((n) => foldName(n.text));
  const questionFold = foldName(pack.question);
  // Per note, the figures and the estimate-only figures it holds. A sentence's figures
  // must come from the notes it cites (plus the question), not from any note of the pack.
  const figuresByNote = pack.notes.map((n) => new Set(figuresOf(n.text)));
  const questionFigures = new Set(figuresOf(pack.question));
  // Figures the notes write only as estimates ("~€87 est."): the sentence
  // must carry the tilde too.
  const estOf = (text) => {
    const exactSet = new Set(figuresOf(text.replace(/~\s*[^\s;,]*\d[\d.,]*/g, ' ')));
    return new Set((text.match(/~\s*[^\s;,]*?\d[\d.,]*/g) || []).flatMap(figuresOf).filter((f) => !exactSet.has(f)));
  };
  const estOnly = estOf(noteText);
  const estOnlyByNote = pack.notes.map((n) => estOf(n.text));
  return function check(sentence, { noFigures = opts.noFigures } = {}) {
    const why = [];
    if (!sentence.cites.length) why.push('nocite');
    if (sentence.cites.some((c) => c < 1 || c > pack.notes.length)) why.push('badcite');
    const sentenceFigures = figuresOf(sentence.text);
    for (const f of sentenceFigures) {
      if (!allowedFigures.has(f)) { why.push(`figure:${f}`); break; }
    }
    if (watchRe) watchRe.lastIndex = 0;
    const hit = watchRe ? watchRe.exec(sentence.text) : null;
    if (hit) why.push(`place:${hit[1]}`);
    const folded = foldName(sentence.text).replace(NOT_A_VERDICT, ' ');
    const verdict = folded.match(COMPARE);
    // A comparison stands on a note the code wrote for it, or on a cited
    // note that makes the same comparison itself (a guide's "quieter than").
    if (verdict && !sentence.cites.some((c) => cmpNotes.has(c)
      || (noteFold[c - 1] || '').replace(NOT_A_VERDICT, ' ').includes(verdict[1]))) why.push(`compare:${verdict[1]}`);
    if (!sentence.text.includes('~') && sentenceFigures.some((f) => estOnly.has(f))) why.push('estmark');

    // The cited-note rules (A3). They need a real cite: a sentence without one has already failed.
    const cited = [...new Set(sentence.cites.filter((c) => c >= 1 && c <= pack.notes.length))];
    if (cited.length) {
      const okFigure = new Set(questionFigures);
      for (const c of cited) for (const f of figuresByNote[c - 1]) okFigure.add(f);
      const stray = sentenceFigures.find((f) => allowedFigures.has(f) && !okFigure.has(f));
      if (stray) why.push(`figure-uncited:${stray}`);
      const citedFold = cited.map((c) => noteFold[c - 1]).join(' ');
      const seen = seenRe ? [...sentence.text.matchAll(seenRe)].map((m) => m[1]) : [];
      const lost = seen.find((name) => !hasName(citedFold, name) && !hasName(questionFold, name));
      if (lost) why.push(`place-uncited:${lost}`);
      for (const m of foldName(sentence.text).matchAll(DAY_LABEL)) {
        const label = new RegExp(`(?:^|[^\\p{L}])${m[1]}\\s+${m[2]}(?![\\d.,]\\d)`, 'u');
        if (!label.test(citedFold) && !label.test(questionFold)) { why.push(`subject-uncited:${m[1]} ${m[2]}`); break; }
      }
      if (!sentence.text.includes('~')) {
        const estCited = new Set();
        const exactCited = new Set();
        for (const c of cited) {
          for (const f of estOnlyByNote[c - 1]) estCited.add(f);
          for (const f of figuresByNote[c - 1]) if (!estOnlyByNote[c - 1].has(f)) exactCited.add(f);
        }
        if (!why.includes('estmark') && sentenceFigures.some((f) => estCited.has(f) && !exactCited.has(f))) why.push('estmark');
      }
    }
    if (noFigures) {
      everyRe ||= nameRe(names);
      const bare = everyRe ? sentence.text.replace(everyRe, (m, name) => m.replace(name, ' ')) : sentence.text;
      if (/[\d€£$%]/.test(bare)) why.push('figure-free');
    }
    return { text: stripDashes(sentence.text), cites: sentence.cites, ok: why.length === 0, why };
  };
}

/**
 * The whole written answer checked: the sentences that pass, the ones that
 * did not (for the report and tests), and whether to withdraw it.
 */
export function verifyAnswer(text, pack, knownPlaces = [], opts = {}) {
  const check = makeChecker(pack, knownPlaces, opts);
  const { sentences } = splitSentences(text);
  const checked = sentences.map(check);
  const kept = checked.filter((s) => s.ok);
  const failed = checked.filter((s) => !s.ok);
  const withdrawn = !kept.length || failed.length / Math.max(1, checked.length) > WITHDRAW;
  return { kept, failed, withdrawn, total: checked.length };
}
