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
