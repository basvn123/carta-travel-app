/**
 * The fold the place linker reads with (T1153, ROADMAP F4).
 *
 * A copy of foldName in src/lib/searchIndex.js (and fold() in
 * pipeline/search_index_layer.py), kept here so the linker has no import
 * outside this folder and runs unchanged in the browser, in Node and in a
 * Deno Edge Function. tests/placeLinking.test.mjs asserts the two agree.
 */
const FOLD_TABLE = {
  'ł': 'l', 'Ł': 'l', 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae',
  'œ': 'oe', 'Œ': 'oe', 'ß': 'ss', 'đ': 'd', 'Đ': 'd',
  'þ': 'th', 'Þ': 'th', 'ð': 'd', 'Ð': 'd',
};

export function fold(s) {
  let x = String(s || '');
  x = x.replace(/[łŁøØæÆœŒßđĐþÞðÐ]/g, (c) => FOLD_TABLE[c] || c);
  x = x.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return x.replace(/[-'’]/g, ' ').toLowerCase().trim();
}

/** Fold, then keep letters, digits and single spaces only. */
export function clean(s) {
  return fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Spellings that sound alike across Greek and Nordic transliterations
// (T1215, row T1153-g): Pafos and Paphos, Hania and Chania, Aarhus and
// Arhus, Tromsoe and Tromso. Applied in order to a cleaned key, on both sides.
const SOUND = [
  [/ph/g, 'f'], [/th/g, 't'], [/dh/g, 'd'], [/gh/g, 'g'], [/kh/g, 'h'], [/ch/g, 'h'],
  [/ck/g, 'k'], [/c/g, 'k'], [/q/g, 'k'],
  [/aa/g, 'a'], [/ae/g, 'e'], [/oe/g, 'o'], [/ou/g, 'u'], [/ei/g, 'i'], [/y/g, 'i'],
  [/([a-z])\1+/g, '$1'],
];

/** A cleaned key reduced to how it sounds; equal keys are sound-alikes. */
export function soundKey(s) {
  let x = clean(s);
  for (const [re, to] of SOUND) x = x.replace(re, to);
  return x;
}
