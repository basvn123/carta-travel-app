/**
 * The fold-and-alias search matcher (PLAN.md B2), client half.
 *
 * pipeline/search_index_layer.py emits public/search_index.json; this loads
 * it once on the first real search and answers queries in three passes -
 * exact/prefix, folded substring, then edit distance 1 for queries of five
 * or more characters. A query that still matches nothing gets the nearest
 * three keys as suggestions: a real European place name must never be an
 * empty box.
 *
 * The fold mirrors the pipeline exactly (NFKD plus the explicit table for
 * the letters NFKD leaves alone), because two half-matching folds are worse
 * than none.
 */

const FOLD_TABLE = {
  'ł': 'l', 'Ł': 'l', 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae',
  'œ': 'oe', 'Œ': 'oe', 'ß': 'ss', 'đ': 'd', 'Đ': 'd',
  'þ': 'th', 'Þ': 'th', 'ð': 'd', 'Ð': 'd',
};

export function foldName(s) {
  let x = (s || '');
  x = x.replace(/[łŁøØæÆœŒßđĐþÞðÐ]/g, (c) => FOLD_TABLE[c] || c);
  x = x.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return x.replace(/[-'’]/g, ' ').toLowerCase().trim();
}

let indexPromise = null;

export function loadSearchIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${import.meta.env.BASE_URL || '/'}search_index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return indexPromise;
}

function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  const la = a.length; const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; } else if (la > lb) { i++; } else { j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * -> { ids: Set|null, bbox, regionLabel, memberHits: [{id, member}],
 *      suggestions: [key...] }
 * ids === null means "the index has no opinion" (query too short);
 * an empty Set means "searched and found nothing".
 */
export function querySearchIndex(index, rawQuery) {
  const q = foldName(rawQuery);
  const none = { ids: null, bbox: null, regionLabel: null,
    memberHits: [], suggestions: [] };
  if (!index || q.length < 3) return none;

  const region = index.regions[q]
    || index.regions[Object.keys(index.regions).find((k) => k.startsWith(q)) || ''];
  if (region) {
    return { ...none, bbox: region.bbox, regionLabel: region.label };
  }

  const ids = new Set();
  const memberHits = [];
  const collect = (rows) => {
    for (const row of rows) {
      ids.add(row[1]);
      if (row[0] === 'm') memberHits.push({ id: row[1], member: row[2] });
    }
  };

  if (index.entries[q]) collect(index.entries[q]);
  if (!ids.size) {
    for (const key of Object.keys(index.entries)) {
      if (key.startsWith(q)) collect(index.entries[key]);
    }
  }
  if (!ids.size) {
    for (const key of Object.keys(index.entries)) {
      if (key.includes(q)) collect(index.entries[key]);
    }
  }
  if (!ids.size && q.length >= 5) {
    for (const key of Object.keys(index.entries)) {
      if (editDistanceAtMost1(q, key)) collect(index.entries[key]);
    }
  }

  let suggestions = [];
  if (!ids.size) {
    // nearest three keys: shared-prefix length first, then shortness
    suggestions = Object.keys(index.entries)
      .map((key) => {
        let p = 0;
        while (p < q.length && p < key.length && q[p] === key[p]) p++;
        return [p, -key.length, key];
      })
      .sort((a, b) => b[0] - a[0] || b[1] - a[1])
      .slice(0, 3)
      .map(([, , key]) => key);
  }
  return { ids, bbox: null, regionLabel: null, memberHits, suggestions };
}
