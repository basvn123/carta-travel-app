/**
 * The shared glossary (T156, trips spec C7 and C8, destinations spec 4.1).
 *
 * One entry per term, written once. The words themselves live in the six
 * i18n catalogues under `glossary.<id>.term` and `glossary.<id>.text`; this
 * file holds the ids, which section asks for each term, and the spellings
 * that safely identify a term inside free text. <InfoDot term="hardpack" />
 * reads the words, so a definition is never typed on a screen.
 *
 * To add a term: add its id here, add the two keys to all six catalogues,
 * and tests/glossary.test.mjs checks that nothing is missing.
 *
 * `scope` says who asked for it: 'trips', 'destinations' or 'both'. It is
 * documentation and a filter, not a gate, any screen may use any term.
 * `match` is a pattern for spellings that cannot mean anything else. A term
 * with no `match` (col, loop, isolation) is only ever attached by a screen
 * that knows what it is showing, never by sniffing text.
 */
export const GLOSSARY = {
  hardpack: { scope: 'both', match: /\bhard-?pack(?:ed)?\b/i },
  bora: { scope: 'trips', match: /\bbora\b/i },
  'hut-to-hut': { scope: 'both', match: /\bhut[- ]to[- ]hut\b/i },
  singletrack: { scope: 'both', match: /\bsingle-?track\b/i },
  ehic: { scope: 'trips', match: /\b(?:EHIC|GHIC)\b/ },
  vignette: { scope: 'trips', match: /\bvignettes?\b/i },
  tbe: { scope: 'trips', match: /\bTBE\b/ },
  'fire-road': { scope: 'destinations', match: /\bfire ?roads?\b/i },
  scree: { scope: 'destinations', match: /\bscree\b/i },
  'via-ferrata': { scope: 'destinations', match: /\bvia(?:e)? ferrat(?:a|e)\b/i },
  'sac-scale': { scope: 'destinations', match: /\bsac[_ ]scale\b/i },
  prominence: { scope: 'destinations', match: /\bprominence\b/i },
  isolation: { scope: 'destinations' },
  col: { scope: 'destinations' },
  massif: { scope: 'destinations', match: /\bmassif\b/i },
  bothy: { scope: 'destinations', match: /\b(?:bothy|bothies)\b/i },
  refuge: { scope: 'destinations' },
  traverse: { scope: 'destinations' },
  'out-and-back': { scope: 'destinations', match: /\bout[- ]and[- ]back\b/i },
  loop: { scope: 'destinations' },
  waymarking: { scope: 'destinations', match: /\bway-?mark(?:ing|ed)\b/i },
  gr: { scope: 'destinations', match: /\bGR ?\d{1,3}\b/ },
  eurovelo: { scope: 'destinations', match: /\bEuroVelo\b/i },
  'node-network': { scope: 'destinations', match: /\bknooppunt(?:en)?\b|\bnode network\b/i },
  'rail-trail': { scope: 'destinations', match: /\brail[- ]trail\b/i },
  greenway: { scope: 'destinations', match: /\bgreenways?\b/i },
  'traffic-free': { scope: 'destinations', match: /\btraffic[- ]free\b/i },
  'gravel-bike': { scope: 'destinations', match: /\bgravel bike\b/i },
  'bathing-water': { scope: 'destinations', match: /\bbathing water (?:class|rating|quality)/i },
  'blue-flag': { scope: 'destinations', match: /\bblue flag\b/i },
  secchi: { scope: 'destinations', match: /\bsecchi\b/i },
  'blue-green-algae': { scope: 'destinations', match: /\bblue-green algae\b/i },
  'shoulder-season': { scope: 'destinations', match: /\bshoulder season\b/i },
  'snow-line': { scope: 'destinations', match: /\bsnow ?line\b/i },
  'natura-2000': { scope: 'destinations', match: /\bnatura 2000\b/i },
  gpx: { scope: 'both', match: /\bGPX\b/ },
  'wave-height': { scope: 'destinations', match: /\bsignificant wave height\b/i },
  thermocline: { scope: 'destinations', match: /\bthermocline\b/i },
};

export const GLOSSARY_IDS = Object.keys(GLOSSARY);

/** The two catalogue keys of a term. */
export const glossaryKeys = (id) => ({
  term: `glossary.${id}.term`,
  text: `glossary.${id}.text`,
});

export const hasTerm = (id) => Object.hasOwn(GLOSSARY, id);

/** The id of the first glossary term whose spelling appears in `text`, or null. */
export function glossaryIdIn(text) {
  const s = String(text || '');
  for (const id of GLOSSARY_IDS) {
    const re = GLOSSARY[id].match;
    if (re && re.test(s)) return id;
  }
  return null;
}

/**
 * Cut a line of copy into segments: [{ text }] and [{ term }] in order, with
 * a term segment after the first mention of each glossary term. Joining the
 * text segments gives back the original line.
 */
export function glossarySplit(text) {
  const s = String(text ?? '');
  const hits = [];
  for (const id of GLOSSARY_IDS) {
    const re = GLOSSARY[id].match;
    if (!re) continue;
    const m = s.match(new RegExp(re.source, re.flags.replace('g', '')));
    if (m) hits.push({ id, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.end - b.end);
  const out = [];
  let at = 0;
  for (const h of hits) {
    if (h.end <= at) continue;
    out.push({ text: s.slice(at, h.end) }, { term: h.id });
    at = h.end;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}
