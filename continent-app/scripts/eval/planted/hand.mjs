/*
 * The 100 hand plants of the E-plant row (north-star decision 7.3): ten
 * hand-chosen mini packs, ten hand-written bad sentences each, in the shapes
 * a small model really produces:
 *
 *   wrong-comparison  4 per pack: a verdict ("cheaper", "drier", "best") on a note the
 *                     code did not write for it, or on a comparison note about two
 *                     other places
 *   unknown-venue     3 per pack: a catalogue place the cited note and the question never name
 *                     (two are in no note; one is in another note of the pack, so only the
 *                     cited-note rule can drop it)
 *   no-cite           3 per pack: a sentence that cites nothing, or a note that does not exist
 *
 * Each plant must be dropped. "unknown venue" means a catalogue place: the
 * verifier knows catalogue names only, so an invented name outside the
 * catalogue is out of reach of any note rule and is reported as such in
 * results.md, not counted here.
 *
 * Seven more probes (REVERSED) say the right comparison the wrong way round
 * ("Porto is cheaper than Lisbon" under a note that says the opposite). They
 * need meaning, not text, so no note rule drops them: the stated residual of
 * the comparison rule, reported apart and never counted in the 100.
 */

const L = {
  en: { cheap: 'cheaper', dry: 'drier', than: 'than', best: 'The best', per: 'a day', rain: 'of rain', june: 'in June', cmpNote: (a, b, d) => `${a} is cheaper than ${b} by €${d} a day.` },
  nl: { cheap: 'goedkoper', dry: 'droger', than: 'dan', best: 'De beste', per: 'per dag', rain: 'regen', june: 'in juni', cmpNote: (a, b, d) => `${a} is goedkoper dan ${b}, €${d} per dag.` },
  de: { cheap: 'billiger', dry: 'trockener', than: 'als', best: 'Das beste', per: 'pro Tag', rain: 'Regen', june: 'im Juni', cmpNote: (a, b, d) => `${a} ist billiger als ${b}, €${d} pro Tag.` },
  fr: { cheap: 'moins cher', dry: 'plus sec', than: 'que', best: 'Le meilleur', per: 'par jour', rain: 'de pluie', june: 'en juin', cmpNote: (a, b, d) => `${a} est moins cher que ${b}, €${d} par jour.` },
  es: { cheap: 'mas barato', dry: 'mas seco', than: 'que', best: 'El mejor', per: 'al dia', rain: 'de lluvia', june: 'en junio', cmpNote: (a, b, d) => `${a} es mas barato que ${b}, €${d} al dia.` },
};

// a, b: the two places of the notes; c, d: catalogue places the notes never name.
const SPECS = [
  { lang: 'en', a: 'Lisbon', b: 'Porto', c: 'Seville', d: 'Prague', pa: 87, pb: 95, t: 24, mm: 31, diff: 8 },
  { lang: 'en', a: 'Vienna', b: 'Budapest', c: 'Athens', d: 'Rome', pa: 112, pb: 78, t: 22, mm: 64, diff: 34 },
  { lang: 'en', a: 'Florence', b: 'Venice', c: 'Lisbon', d: 'Berlin', pa: 120, pb: 140, t: 27, mm: 55, diff: 20 },
  { lang: 'nl', a: 'Prague', b: 'Vienna', c: 'Porto', d: 'Athens', pa: 74, pb: 112, t: 23, mm: 70, diff: 38 },
  { lang: 'de', a: 'Berlin', b: 'Munich', c: 'Seville', d: 'Florence', pa: 95, pb: 118, t: 21, mm: 68, diff: 23 },
  { lang: 'fr', a: 'Paris', b: 'Lyon', c: 'Rome', d: 'Lisbon', pa: 150, pb: 98, t: 22, mm: 52, diff: 52 },
  { lang: 'es', a: 'Seville', b: 'Madrid', c: 'Porto', d: 'Vienna', pa: 84, pb: 101, t: 33, mm: 5, diff: 17 },
  { lang: 'en', a: 'Amsterdam', b: 'Brussels', c: 'Prague', d: 'Budapest', pa: 160, pb: 118, t: 20, mm: 66, diff: 42 },
  { lang: 'nl', a: 'Athens', b: 'Rome', c: 'Venice', d: 'Berlin', pa: 98, pb: 124, t: 31, mm: 6, diff: 26 },
  { lang: 'en', a: 'Copenhagen', b: 'Stockholm', c: 'Munich', d: 'Paris', pa: 170, pb: 150, t: 19, mm: 58, diff: 20 },
];

function packOf(s) {
  const w = L[s.lang];
  return {
    v: 4, lang: s.lang, // The question names no place, so a place in a sentence has to stand in a cited note.
    question: 'Which one is nicer?',
    notes: [
      { n: 1, kind: 'fact', destId: null, text: `${s.a}: about €${s.pa} ${w.per}, ${s.t}° ${w.june}, ${s.mm} mm ${w.rain}.` },
      { n: 2, kind: 'fact', destId: null, text: `${s.b}: about €${s.pb} ${w.per}, ${s.t - 2}° ${w.june}, ${s.mm + 9} mm ${w.rain}.` },
      { n: 3, kind: 'cmp', destId: null, text: w.cmpNote(s.a, s.b, s.diff) },
    ],
    places: [{ id: s.a, city: s.a, country: 'XX' }, { id: s.b, city: s.b, country: 'XX' }],
  };
}

function sentencesOf(s) {
  const w = L[s.lang];
  const e = [];
  const add = (kind, sentence, cites) => e.push({ kind, sentence, cites });
  // wrong comparison: a verdict on a fact note, or on a comparison note about other places.
  add('wrong-comparison', `${s.a} is ${w.cheap} ${w.than} ${s.b}. [1]`, [1]);
  add('wrong-comparison', `${s.b} is ${w.dry} ${w.than} ${s.a}. [2]`, [2]);
  add('wrong-comparison', `${s.a} is ${w.cheap} ${w.than} ${s.c}. [3]`, [3]);
  add('wrong-comparison', `${s.d} is ${w.dry} ${w.than} ${s.b}. [3]`, [3]);
  // unknown venue: a catalogue place the cited note and the question do not name.
  add('unknown-venue', `${s.c} ${w.per}: €${s.pa}. [1]`, [1]);
  add('unknown-venue', `${s.d} ${s.t}° ${w.june}. [2]`, [2]);
  add('unknown-venue', `${s.b} ${s.mm} mm ${w.rain}. [1]`, [1]);
  // no cite: nothing cited, or a note number the pack does not have.
  add('no-cite', `${s.a} €${s.pa} ${w.per}.`, []);
  add('no-cite', `${s.b} ${s.t - 2}° ${w.june}.`, []);
  add('no-cite', `${s.a} €${s.pa} ${w.per}. [9]`, [9]);
  return e;
}

/** The 100 hand plants: { id, kind, pack, sentence, cites, expect: 'drop' }. */
export function handPlants() {
  const out = [];
  SPECS.forEach((s, i) => {
    const pack = packOf(s);
    sentencesOf(s).forEach((x, j) => out.push({ id: `hand${i}:${j}`, kind: x.kind, hand: true, pack, sentence: x.sentence, cites: x.cites, expect: 'drop' }));
  });
  return out;
}

/** The comparison said the wrong way round, under the note that has it right: the stated residual, apart from the 100. */
export function reversedProbes() {
  return SPECS.slice(0, 7).map((s, i) => ({
    id: `reversed${i}`, kind: 'reversed-comparison', hand: true, pack: packOf(s),
    sentence: `${s.b} is ${L[s.lang].cheap} ${L[s.lang].than} ${s.a}. [3]`, cites: [3], expect: 'residual',
  }));
}

export const HAND_SPECS = SPECS;
