/**
 * The place linker (T1153, ROADMAP F4): one messy mention in, catalogue
 * places out, ranked, with a confidence and a "did you mean" list.
 *
 *   const linker = makeLinker({ destinations, searchIndex, lexicon });
 *   linkPlace(linker, 'flight to BCN', { country: 'ES', airport: 'BCN' })
 *   -> { linked: { id, name, score, alias, kind } | null,
 *        candidates: [{ id, name, score, sim, alias, kind, label }],
 *        didYouMean: [{ id, name, score }], confident, iata }
 *
 * How (Execution/P15/T1153-place-linking.md, research section):
 *  1. Clean the mention: fold, drop booking and trip words, read IATA codes
 *     and a country name written in it.
 *  2. Candidates: exact alias keys over every window of up to four words,
 *     BM25 over alias words, and character trigram overlap (Dice), which
 *     is what catches typos and near forms ("dubrovnk", "lissabon").
 *  3. Rerank each alias: string similarity (exact, prefix, Dice, edit
 *     distance) times the alias kind's weight, plus a popularity prior and
 *     context (the country, a nearby airport).
 *  4. One row per place group (Rome's airports are one place), then
 *     confident when the top score and its margin over the next pass the
 *     thresholds; otherwise the top three are a "did you mean".
 *
 * Pure JavaScript with no imports outside this folder, so parse-booking
 * (Deno) and Ask can load the same file. No model is called.
 */
import { buildAliases } from './aliases.js';
import { clean, soundKey } from './fold.js';

export const LINK_DEFAULTS = {
  confident: 0.86,     // top score at or above this, and
  margin: 0.05,        // at least this far above the next place, links
  suggest: 0.55,       // a "did you mean" needs at least this
  keep: 0.5,           // search keeps candidates from here
  limit: 10,
  pool: 120,           // trigram candidates scored per mention
  uncovered: 0.25,     // cost of an exact window that explains only part of the mention
  accent: 0.05,        // the mention spelt with the name's own accents (Fårö, not Faro);
                       // the same cost when the mention's accents are not the name's (T1215)
  sound: 0.9,          // a sound-alike spelling (pafos for Paphos, hania for Chania), T1215
  prior: 0.08,         // weight of the popularity prior
  bm25: 0.04,          // weight of the BM25 word score
  countryBonus: 0.1,
  countryMalus: 0.12,
  airportBonus: 0.08,
  airportKm: 60,
};

// Words that say what a mention is, not where (six languages, folded).
const NOISE = new Set(`
flight flights fly flying vuelo vuelos vol vols volo voli vlucht vluchten flug fluge
to naar nach a au aux en in im te at from van vanaf von de des du da di der den het
the le la les el il lo los las l
hotel hotels hostel hostal apartment apartments apartamento appartement stay stays booking
reservation reservering buchung reserva prenotazione ticket tickets trip reis reise viaje voyage viaggio
airport airports aeroport aeropuerto aeroporto flughafen luchthaven vliegveld intl international
city centre center centro stad stadt ville citta station gare bahnhof estacion stazione
train trein zug tren bus coach car rental return one way roundtrip weekend week days nights night
ryanair easyjet wizz wizzair vueling transavia klm lufthansa tui airlines airline air
best time when to go visit visiting what is like tell me about how expensive worth near
`.split(/\s+/).filter(Boolean));

const MONTHS = new Set(`january february march april may june july august september october november december
jan feb mar apr jun jul aug sep sept oct nov dec januari februari maart mei juni juli augustus oktober
januar februar marz mai dezember janvier fevrier mars avril juin juillet aout septembre octobre novembre decembre
enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre
gennaio febbraio aprile maggio giugno luglio settembre ottobre dicembre`.split(/\s+/).filter(Boolean));

const grams = (s) => {
  const p = ` ${s} `;
  const out = new Set();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
};

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return (2 * n) / (a.size + b.size);
}

/** Optimal string alignment distance (a transposition counts as one edit). */
export function editDistance(a, b, cap = 4) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length; const n = b.length;
  let prev2 = null; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev; prev = cur;
  }
  return prev[n];
}

function haversineKm(a, b) {
  const R = 6371; const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r; const dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Build once per catalogue; every input optional (see aliases.js). */
export function makeLinker(inputs = {}, options = {}) {
  const { rows, places, codes } = buildAliases(inputs);
  const opts = { ...LINK_DEFAULTS, ...options };
  const byKey = new Map();
  const byGram = new Map();
  const byToken = new Map();
  const bySound = new Map();
  const gramSets = [];
  let totalLen = 0;
  rows.forEach((r, i) => {
    (byKey.get(r.key) || byKey.set(r.key, []).get(r.key)).push(i);
    const g = grams(r.key);
    gramSets.push(g);
    for (const x of g) (byGram.get(x) || byGram.set(x, []).get(x)).push(i);
    const toks = r.key.split(' ');
    totalLen += toks.length;
    for (const t of new Set(toks)) (byToken.get(t) || byToken.set(t, []).get(t)).push(i);
    if (r.key.length >= 4) {
      const sk = soundKey(r.key);
      (bySound.get(sk) || bySound.set(sk, []).get(sk)).push(i);
    }
  });
  const countries = new Map();
  for (const p of Object.values(places)) {
    if (p.country && p.iso2) countries.set(clean(p.country), p.iso2);
  }
  return { rows, places, codes, byKey, byGram, byToken, bySound, gramSets, avgLen: totalLen / Math.max(1, rows.length), countries, opts, N: rows.length };
}

function readMention(linker, raw) {
  const rawTokens = String(raw || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const iata = [];
  for (const t of rawTokens) if (/^[A-Z]{3}$/.test(t) && linker.codes[t]) iata.push(t);
  const all = clean(raw).split(' ').filter(Boolean);
  if (all.length === 1 && all[0].length === 3 && linker.codes[all[0].toUpperCase()] && !iata.length) iata.push(all[0].toUpperCase());
  // A country name written in the mention ("valencia spain") is context.
  let country = null;
  let words = all.filter((t) => !/\d/.test(t));
  for (const [name, iso] of linker.countries) {
    const nt = name.split(' ');
    for (let i = 0; i + nt.length <= words.length; i++) {
      if (words.slice(i, i + nt.length).join(' ') === name && words.length > nt.length) {
        country = iso;
        words = [...words.slice(0, i), ...words.slice(i + nt.length)];
        break;
      }
    }
    if (country) break;
  }
  const core = words.filter((t) => !NOISE.has(t) && !MONTHS.has(t) && !iata.includes(t.toUpperCase()));
  return { words, core, iata, country };
}

function windows(tokens, max) {
  const out = [];
  for (let n = Math.min(max, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

/** Rank catalogue places for one mention. ctx: { country, airport, lat, lon }. */
export function linkPlace(linker, mention, ctx = {}) {
  const o = linker.opts;
  const m = readMention(linker, mention);
  const ctxCountry = (ctx.country || m.country || '').toUpperCase() || null;
  const scores = new Map(); // alias index -> { sim, bm }
  const bump = (i, sim) => {
    const had = scores.get(i);
    if (!had) scores.set(i, { sim, bm: 0 });
    else if (sim > had.sim) had.sim = sim;
  };

  // 1. exact alias keys over every window of the words (noise kept: "palma de mallorca").
  // An exact window that leaves other words of the mention unexplained is
  // worth less: "porto errcole" is Porto Ercole, not Porto.
  const coreSet = new Set(m.core);
  for (const w of windows(m.words, 4)) {
    if (w.length < 3 || NOISE.has(w) || MONTHS.has(w)) continue;
    const hits = linker.byKey.get(w);
    // A sound-alike key (pafos, hania) is nearly as good as the key itself.
    const alike = w.length >= 4 ? linker.bySound.get(soundKey(w)) : null;
    if (!hits && !alike) continue;
    const covered = w.split(' ').filter((t) => coreSet.has(t)).length;
    const cover = m.core.length ? Math.min(1, covered / m.core.length) : 1;
    const f = 1 - o.uncovered * (1 - cover);
    for (const i of hits || []) bump(i, f);
    for (const i of alike || []) bump(i, o.sound * f);
  }

  const coreStr = m.core.join(' ');
  // The words with articles kept ("le croisic") are a window too: the noise
  // list drops "le", and some names start with it.
  const wordsStr = m.words.filter((t) => !MONTHS.has(t)).join(' ');
  const coreWins = coreStr
    ? [...new Set([coreStr, ...(wordsStr !== coreStr && m.words.length <= 5 ? [wordsStr] : []), ...windows(m.core, 3)])]
    : [];
  if (coreStr) {
    // 2a. BM25 over alias words.
    const k1 = 1.2; const b = 0.75;
    for (const t of new Set(m.core)) {
      const post = linker.byToken.get(t);
      if (!post) continue;
      const idf = Math.log(1 + (linker.N - post.length + 0.5) / (post.length + 0.5));
      for (const i of post) {
        const len = linker.rows[i].key.split(' ').length;
        const s = (idf * (k1 + 1)) / (1 + k1 * (1 - b + (b * len) / linker.avgLen));
        const had = scores.get(i) || scores.set(i, { sim: 0, bm: 0 }).get(i);
        had.bm += s;
      }
    }
    // 2b. trigram overlap: the aliases sharing the most (rare) grams with the mention.
    // Each shared gram counts by its rarity, so " le" (in hundreds of names) says little.
    const counts = new Map();
    for (const g of new Set([...grams(coreStr), ...(wordsStr !== coreStr && m.words.length <= 5 ? grams(wordsStr) : [])])) {
      const post = linker.byGram.get(g);
      if (!post) continue;
      const idf = Math.log(linker.N / post.length);
      for (const i of post) counts.set(i, (counts.get(i) || 0) + idf);
    }
    const top = [...counts.entries()]
      .map(([i, c]) => [i, c / Math.sqrt(linker.gramSets[i].size)])
      .sort((a, z) => z[1] - a[1]).slice(0, o.pool);
    for (const [i] of top) if (!scores.has(i)) scores.set(i, { sim: 0, bm: 0 });
  }

  // 3. similarity of each candidate alias to the best window of the mention.
  // Each window carries the share of the mention it leaves unexplained.
  const winGrams = coreWins.map((w) => {
    const covered = w.split(' ').filter((t) => coreSet.has(t)).length;
    const cover = m.core.length ? Math.min(1, covered / m.core.length) : 1;
    return [w, grams(w), 1 - o.uncovered * (1 - cover)];
  });
  const rawLow = String(mention || '').normalize('NFC').toLowerCase().trim();
  const accented = /[^a-z0-9\s.,'()&/-]/.test(rawLow) && rawLow !== clean(rawLow);
  const last = m.core[m.core.length - 1] || '';
  let bmMax = 0;
  for (const v of scores.values()) if (v.bm > bmMax) bmMax = v.bm;
  const perPlace = new Map();
  for (const [i, v] of scores) {
    const r = linker.rows[i];
    let sim = v.sim;
    if (sim < 1) {
      for (const [w, g, f] of winGrams) {
        if (w === r.key) { sim = Math.max(sim, f); continue; }
        const d = dice(g, linker.gramSets[i]);
        const L = Math.max(w.length, r.key.length);
        const ed = L >= 4 ? editDistance(w, r.key, 3) : 9;
        const es = ed <= 3 ? 1 - ed / L : 0;
        // A word still being typed: "barc" is on its way to "barcelona".
        const pre = w === coreStr && last.length >= 3 && r.key.startsWith(w) ? 0.72 + 0.2 * (w.length / r.key.length) : 0;
        sim = Math.max(sim, f * Math.max(d, es), pre);
      }
    }
    if (sim <= 0 && !v.bm) continue;
    const p = linker.places[r.id];
    // Accents decide between twins: "Fårö" is the Gotland island, not Faro.
    const accentFit = !accented || !r.raw ? 0 : r.raw === rawLow ? o.accent : clean(r.raw) === clean(rawLow) ? -o.accent : 0;
    let score = accentFit + sim * r.w + o.prior * p.prior + o.bm25 * (bmMax ? v.bm / bmMax : 0);
    if (ctxCountry && p.iso2) score += p.iso2 === ctxCountry ? o.countryBonus : -o.countryMalus;
    if (ctx.airport) {
      const code = String(ctx.airport).toUpperCase();
      const ap = linker.codes[code]?.map((id) => linker.places[id]).find(Boolean);
      const near = p.iata === code || p.anchor === code
        || (ap && ap.lat != null && p.lat != null && haversineKm(ap, p) <= o.airportKm);
      if (near) score += o.airportBonus;
    }
    const had = perPlace.get(r.id);
    if (!had || score > had.score) perPlace.set(r.id, { id: r.id, name: p.name, score, sim, alias: r.key, kind: r.kind, label: r.label });
  }
  // An IATA code is a fact, not a guess: its airport goes first.
  for (const code of m.iata) {
    for (const id of linker.codes[code]) {
      const p = linker.places[id];
      perPlace.set(id, { id, name: p.name, score: 1.1 + o.prior * p.prior, sim: 1, alias: code.toLowerCase(), kind: 'iata', label: null });
    }
  }

  // 4. one row per place group, best first.
  const sorted = [...perPlace.values()].sort((a, z) => z.score - a.score || (a.name || '').localeCompare(z.name || ''));
  const groups = new Map();
  for (const c of sorted) {
    const g = linker.places[c.id].group;
    if (!groups.has(g)) groups.set(g, { ...c, group: g, members: [c.id] });
    else groups.get(g).members.push(c.id);
  }
  const ranked = [...groups.values()];
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const margin = top ? top.score - (second ? second.score : 0) : 0;
  const confident = !!top && top.score >= o.confident && margin >= o.margin;
  const round = (x) => Math.round(x * 1000) / 1000;
  const candidates = ranked.slice(0, o.limit).map((c) => ({ ...c, score: round(c.score), sim: round(c.sim) }));
  return {
    mention: String(mention || ''),
    linked: confident ? candidates[0] : null,
    confident,
    margin: round(margin),
    candidates,
    didYouMean: confident ? [] : candidates.filter((c) => c.score >= o.suggest).slice(0, 3).map(({ id, name, score }) => ({ id, name, score })),
    iata: m.iata,
    country: ctxCountry,
  };
}
