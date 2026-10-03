/**
 * contract.mjs, the app_data.json contract, written down as code.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * There is no runtime validator in the app. src/lib/appData.js fetches
 * /app_data.json and hands the parsed object straight to useAppData, which
 * reads meta.defaults, meta.baggage_options, meta.accommodation_model and
 * meta.car_model with optional chaining and falls back on every one of them.
 * hydrateForOrigin then walks destinations and rebuilds routes. Nothing
 * throws. A payload missing half its keys renders an app with no prices and
 * no error, which is exactly the failure that reaches a user rather than a
 * build log.
 *
 * So the checks below are written from docs/SCHEMA.md's required fields and
 * from what the app actually dereferences, not imported from a validator that
 * does not exist. When somebody writes a real hydration-time validator, this
 * file should import it instead and keep only the checks the validator does
 * not cover.
 *
 * WHAT COUNTS AS REQUIRED
 *
 * Deliberately narrow. A field is required here only when the app is visibly
 * broken without it, not merely thinner. meta.schema_version, the currency,
 * the fare window, the defaults block and the baggage options are all read on
 * the boot path. Per destination: an id, a tier, a city, a country, an iso2
 * and finite coordinates. Everything else (climate, crowding, guide, beauty,
 * dossier joins) is a layer the app degrades through on purpose, and asserting
 * on those would make this gate fail for reasons that are not contract breaks.
 *
 * The version is pinned to what the SHIPPED payload carries, not to what the
 * documentation claims. As of T029 public/app_data.json has
 * meta.schema_version 17 while docs/SCHEMA.md's header still says 15; the
 * document's own later sections go up to "Schema v17", so 15 is stale prose
 * and 17 is the contract. Pinning to the file rather than the doc is the
 * whole point of the gate: a pipeline change that bumps the version has to
 * come here and to SCHEMA.md in the same task, and a tripwire nobody has to
 * touch is a tripwire that is not attached to anything.
 */

export const EXPECTED_SCHEMA_VERSION = 17;

// Top-level keys the boot path reads before it can render a price.
const REQUIRED_META = [
  'schema_version', 'currency', 'start_date', 'end_date',
  'defaults', 'baggage_options',
];

// Per destination, the fields with no fallback anywhere in the app.
const REQUIRED_DEST = ['id', 'tier', 'city', 'country', 'iso2'];

// Mirror of src/lib/fareFile.js. A fare slice for an origin whose IATA code
// collides with a DOS device name ships with a trailing underscore, and the
// escape has to hold on both ends or that origin silently ships no fares.
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
]);

export function fareFileBase(origin) {
  const code = String(origin || '').toUpperCase();
  return RESERVED.has(code) ? `${code}_` : code;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a parsed app_data payload. Returns an array of problem strings;
 * empty means it passes.
 *
 * `fareFiles` is an optional array of fare slice basenames (no extension) as
 * they exist on disk. When given, every basename must be one fareFileBase()
 * could have produced, because a slice named PRN.json is a file git will not
 * index and the app will never fetch.
 *
 * `contract` is the key set parsed from docs/SCHEMA.md by
 * parseSchemaContract(). When given, a meta key or a destination key that
 * the document does not list is a problem (a renamed or new field has to be
 * written into SCHEMA.md in the same change). `catalogue: true` adds the
 * presence half, which only makes sense on a real catalogue and not on the
 * trimmed fixture: every listed meta key is there, every "every" key is on
 * every destination, and every "some" key is on at least one.
 */
export function validateAppData(data, { fareFiles = null, contract = null, catalogue = false } = {}) {
  const problems = [];
  const bad = (m) => problems.push(m);

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return ['payload is not an object'];
  }

  const meta = data.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    bad('meta is missing or not an object');
  } else {
    for (const k of REQUIRED_META) {
      if (!(k in meta)) bad(`meta.${k} is missing`);
    }
    if ('schema_version' in meta && meta.schema_version !== EXPECTED_SCHEMA_VERSION) {
      bad(`meta.schema_version is ${JSON.stringify(meta.schema_version)}, `
        + `expected ${EXPECTED_SCHEMA_VERSION} (see docs/SCHEMA.md)`);
    }
    if ('currency' in meta && meta.currency !== 'EUR') {
      bad(`meta.currency is ${JSON.stringify(meta.currency)}, expected "EUR"`);
    }
    for (const k of ['start_date', 'end_date']) {
      const v = meta[k];
      if (k in meta && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
        bad(`meta.${k} is not an ISO date: ${JSON.stringify(v)}`);
      }
    }
    if (meta.defaults !== undefined
        && (meta.defaults === null || typeof meta.defaults !== 'object')) {
      bad('meta.defaults is not an object');
    }
    if (meta.baggage_options !== undefined
        && (meta.baggage_options === null || typeof meta.baggage_options !== 'object')) {
      bad('meta.baggage_options is not an object');
    }
  }

  const dests = data.destinations;
  if (dests === null || typeof dests !== 'object' || Array.isArray(dests)) {
    bad('destinations is missing or not an object');
    return problems;
  }

  // Pair the "every destination satisfies P" walk below with a minimum count.
  // Without it an empty destinations map passes every per-destination check
  // vacuously, which is the exact shape of gate this repo has been burned by
  // before. One destination is not a real catalogue either, so the floor is
  // set where a fixture is still allowed but an empty or truncated ship is not.
  const ids = Object.keys(dests);
  if (ids.length < 2) {
    bad(`destinations holds ${ids.length} entries; a valid payload has at least 2`);
  }

  for (const key of ids) {
    const d = dests[key];
    const where = `destinations.${key}`;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) {
      bad(`${where} is not an object`);
      continue;
    }
    for (const f of REQUIRED_DEST) {
      if (d[f] === undefined || d[f] === null || d[f] === '') {
        bad(`${where}.${f} is missing`);
      }
    }
    if (d.id !== undefined && d.id !== key) {
      bad(`${where}.id is ${JSON.stringify(d.id)}, does not match its key`);
    }
    if (d.tier !== undefined && d.tier !== 'airport' && d.tier !== 'gem') {
      bad(`${where}.tier is ${JSON.stringify(d.tier)}, expected "airport" or "gem"`);
    }
    // Coordinates are the field most likely to arrive as a string from a
    // hand-edited or CSV-round-tripped payload, and a string latitude puts a
    // marker at NaN, which is the MapLibre crash this repo already has a
    // memory about. Type is asserted, not coerced.
    for (const f of ['lat', 'lon']) {
      if (!isFiniteNum(d[f])) {
        bad(`${where}.${f} is not a finite number: ${JSON.stringify(d[f])}`);
      }
    }
    if (isFiniteNum(d.lat) && (d.lat < -90 || d.lat > 90)) {
      bad(`${where}.lat out of range: ${d.lat}`);
    }
    if (isFiniteNum(d.lon) && (d.lon < -180 || d.lon > 180)) {
      bad(`${where}.lon out of range: ${d.lon}`);
    }
  }

  if (contract) problems.push(...checkKeySet(data, contract, { catalogue }));

  if (Array.isArray(fareFiles)) {
    if (fareFiles.length < 1) {
      bad('no fare slices found; the app prices nothing without them');
    }
    for (const base of fareFiles) {
      if (fareFileBase(base.replace(/_$/, '')) !== base) {
        bad(`fare slice "${base}.json" does not match fareFileBase(); `
          + 'a reserved IATA code must ship with its trailing underscore '
          + '(see src/lib/fareFile.js)');
      }
    }
  }

  return problems;
}

/**
 * Validate the split wires that sit beside app_data.json (T267, closing the
 * gap T029 recorded): the boot index, the per-country destination files it
 * names, the per-destination POI shards, the per-origin fare slices and the
 * country insights. The checks are structural and narrow, in the same spirit
 * as validateAppData: a field is required here only when the app is visibly
 * broken without it.
 *
 *   boot          parsed public/boot.json
 *   chunkNames    basenames of the files that exist in public/dest/
 *   chunks        { name: parsed file } for a sample of those files
 *   poiShards     { name: parsed file } for a sample of public/poi/
 *   fareSlices    { name: parsed file } for a sample of public/fares/
 *   insights      parsed public/country_insights.json
 *
 * Every walk is paired with a minimum count, so an empty sample cannot pass
 * vacuously. `poiMin` lowers the POI floor to 0 only where the shards cannot
 * exist (a git checkout in CI, T082); the caller says so out loud.
 */
export function validateSplitWires({ boot, chunkNames = null, chunks = {}, poiShards = {}, fareSlices = {}, insights = null } = {}, { poiMin = 1 } = {}) {
  const problems = [];
  const bad = (m) => problems.push(m);

  if (boot === null || typeof boot !== 'object' || Array.isArray(boot)) {
    return ['boot.json is not an object'];
  }
  if (boot.meta === null || typeof boot.meta !== 'object') {
    bad('boot.json meta is missing');
  } else if (boot.meta.schema_version !== EXPECTED_SCHEMA_VERSION) {
    bad(`boot.json meta.schema_version is ${JSON.stringify(boot.meta.schema_version)}, `
      + `expected ${EXPECTED_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(boot.cols) || boot.cols.length < 4) {
    bad('boot.json cols is missing or too short');
  }
  if (!Array.isArray(boot.d) || boot.d.length < 2) {
    bad(`boot.json d holds ${Array.isArray(boot.d) ? boot.d.length : 'no'} rows; a valid index has at least 2`);
  } else if (Array.isArray(boot.cols)) {
    const width = boot.cols.length;
    const idAt = boot.cols.indexOf('id');
    const latAt = boot.cols.indexOf('lat');
    const lonAt = boot.cols.indexOf('lon');
    if (idAt < 0 || latAt < 0 || lonAt < 0) bad('boot.json cols lacks id, lat or lon');
    else {
      for (const row of boot.d) {
        if (!Array.isArray(row) || row.length !== width) { bad('boot.json has a row that does not match cols'); break; }
        if (typeof row[idAt] !== 'string' || !isFiniteNum(row[latAt]) || !isFiniteNum(row[lonAt])) {
          bad(`boot.json row ${JSON.stringify(row[idAt])} has a bad id or coordinate`); break;
        }
      }
    }
  }
  if (boot.chunks === null || typeof boot.chunks !== 'object' || Array.isArray(boot.chunks)
      || Object.keys(boot.chunks).length < 1) {
    bad('boot.json chunks is missing or empty');
  } else if (Array.isArray(chunkNames)) {
    const have = new Set(chunkNames);
    const missing = Object.keys(boot.chunks).filter((k) => !have.has(k));
    if (missing.length) {
      bad(`boot.json names ${missing.length} destination file(s) that are not on disk: `
        + missing.slice(0, 3).join(', '));
    }
  }

  const sampled = (label, map, check, min) => {
    const names = Object.keys(map);
    if (names.length < min) bad(`${label}: only ${names.length} file(s) sampled, expected at least ${min}`);
    for (const n of names) check(n, map[n]);
  };

  sampled('dest files', chunks, (n, file) => {
    if (file === null || typeof file !== 'object' || Array.isArray(file) || !Object.keys(file).length) {
      bad(`dest/${n}.json is not a non-empty object`);
      return;
    }
    for (const [id, d] of Object.entries(file)) {
      if (d === null || typeof d !== 'object' || !d.tier || !d.city || !d.country) {
        bad(`dest/${n}.json ${id} lacks tier, city or country`);
        break;
      }
    }
  }, 1);

  sampled('poi shards', poiShards, (n, file) => {
    if (!Array.isArray(file)) { bad(`poi/${n}.json is not an array`); return; }
    for (const it of file) {
      if (it === null || typeof it !== 'object' || typeof it.name !== 'string' || !it.name) {
        bad(`poi/${n}.json has an item with no name`); break;
      }
    }
  }, poiMin);

  sampled('fare slices', fareSlices, (n, file) => {
    if (file === null || typeof file !== 'object' || Array.isArray(file) || !Object.keys(file).length) {
      bad(`fares/${n}.json is not a non-empty object`);
      return;
    }
    for (const [anchor, rec] of Object.entries(file)) {
      if (anchor.startsWith('__')) continue; // slice metadata such as __window, not an anchor record
      if (rec === null || typeof rec !== 'object' || rec.out === null || typeof rec.out !== 'object') {
        bad(`fares/${n}.json ${anchor} has no out map`); break;
      }
    }
  }, 1);

  if (insights === null || typeof insights !== 'object' || Array.isArray(insights)
      || Object.keys(insights).length < 1) {
    bad('country_insights.json is not a non-empty object');
  }

  return problems;
}

// ======================================================================
// The documented key set (T082)
// ======================================================================
//
// The checks above are deliberately narrow: they hold the handful of fields
// the boot path cannot do without. They do not notice a field being renamed,
// because a renamed layer (climate arriving as weather, say) leaves every
// required field in place and the app simply stops showing it. So the full
// top-level key set of meta and of a destination is pinned as well, and it is
// pinned in docs/SCHEMA.md, in the "Wire contract" table, not in this file.
// The document is the contract; this code only reads it. A field that is
// renamed, added or dropped without the table changing fails the gate, which
// is what keeps the document and the wire from drifting apart again (the
// header said version 15 for months while 17 shipped).

/**
 * Parse docs/SCHEMA.md. Returns { version, meta, every, some, problems }:
 * the version from the header line, and three Sets of key names from the
 * rows of the "## Wire contract" table, which look like
 *   | `key` | meta | required | ... |
 *   | `key` | destination | every | ... |
 *   | `key` | destination | some | ... |
 */
export function parseSchemaContract(markdown) {
  const problems = [];
  const text = String(markdown || '');
  const v = /`meta\.schema_version`\s*=\s*(\d+)/.exec(text);
  const version = v ? Number(v[1]) : null;
  if (version === null) problems.push('docs/SCHEMA.md has no "`meta.schema_version` = N" line');

  const meta = new Set();
  const every = new Set();
  const some = new Set();
  const start = text.search(/^## Wire contract/m);
  if (start < 0) {
    problems.push('docs/SCHEMA.md has no "## Wire contract" section');
    return { version, meta, every, some, problems };
  }
  const rest = text.slice(start + 3);
  const end = rest.search(/^## /m);
  const section = end < 0 ? rest : rest.slice(0, end);
  const ROW = /^\|\s*`([A-Za-z0-9_]+)`\s*\|\s*(meta|destination)\s*\|\s*(required|every|some)\s*\|/;
  for (const line of section.split(/\r?\n/)) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [, key, block, presence] = m;
    const seen = block === 'meta' ? meta.has(key) : (every.has(key) || some.has(key));
    if (seen) problems.push(`docs/SCHEMA.md lists ${block} key "${key}" twice`);
    if (block === 'meta') {
      if (presence !== 'required') problems.push(`docs/SCHEMA.md meta key "${key}" must be "required"`);
      meta.add(key);
    } else if (presence === 'every') every.add(key);
    else if (presence === 'some') some.add(key);
    else problems.push(`docs/SCHEMA.md destination key "${key}" must be "every" or "some"`);
  }
  // The document cannot drop a key the app has no fallback for, and the
  // table cannot quietly empty itself (a vacuous gate on an empty set).
  for (const k of REQUIRED_META) if (!meta.has(k)) problems.push(`docs/SCHEMA.md wire contract lacks meta key "${k}", which the app reads on boot`);
  for (const k of REQUIRED_DEST) if (!every.has(k)) problems.push(`docs/SCHEMA.md wire contract lacks destination key "${k}" as "every"`);
  if (meta.size < 10 || every.size + some.size < 20) {
    problems.push(`docs/SCHEMA.md wire contract lists ${meta.size} meta and ${every.size + some.size} destination keys; expected at least 10 and 20`);
  }
  return { version, meta, every, some, problems };
}

function checkKeySet(data, contract, { catalogue }) {
  const problems = [];
  const meta = data && data.meta && typeof data.meta === 'object' ? data.meta : {};
  const dests = data && data.destinations && typeof data.destinations === 'object' ? data.destinations : {};
  const HINT = 'add it to the "Wire contract" table in docs/SCHEMA.md, or put the old name back';

  for (const k of Object.keys(meta)) {
    if (!contract.meta.has(k)) problems.push(`meta.${k} is not in docs/SCHEMA.md's wire contract; ${HINT}`);
  }
  const known = new Set([...contract.every, ...contract.some]);
  const unknown = new Map();
  const have = new Map();
  const records = Object.values(dests).filter((d) => d && typeof d === 'object');
  for (const d of records) {
    for (const k of Object.keys(d)) {
      have.set(k, (have.get(k) || 0) + 1);
      if (!known.has(k)) unknown.set(k, (unknown.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of unknown) {
    problems.push(`destination key "${k}" (on ${n} records) is not in docs/SCHEMA.md's wire contract; ${HINT}`);
  }
  if (!catalogue) return problems;

  for (const k of contract.meta) {
    if (!(k in meta)) problems.push(`meta.${k} is listed in docs/SCHEMA.md but the payload has none (renamed or dropped?)`);
  }
  for (const k of contract.every) {
    const n = have.get(k) || 0;
    if (n < records.length) {
      problems.push(`destination key "${k}" is "every" in docs/SCHEMA.md but ${records.length - n} of ${records.length} records lack it`);
    }
  }
  for (const k of contract.some) {
    if (!have.get(k)) problems.push(`destination key "${k}" is listed in docs/SCHEMA.md but no record carries it (renamed or dropped?)`);
  }
  return problems;
}

// ======================================================================
// Frontend to database (T082)
// ======================================================================
//
// The app talks to Supabase through supabase-js: .from('table') chains for
// the tables it reads and writes directly, .rpc('fn', { args }) for the
// functions, functions.invoke('name') for the Edge Functions, and one raw
// keepalive fetch to /rest/v1/rpc/. PostgREST resolves every one of those by
// NAME at request time. A column renamed in a migration, an argument renamed
// in a create-or-replace, a dropped function or a revoked grant is a 400 or
// a 404 in the traveller's browser and nothing at build time. So the gate
// reads the call sites out of the source (extractSupabaseCalls, static, no
// bundler) and checks them against the catalogue a throwaway Postgres builds
// from supabase/migrations (validateDbContract).
//
// What the extractor resolves: string literal table, column and function
// names; select strings, including embedded resources and aliases; the keys
// of object literals passed to insert, update, upsert and rpc (shorthand and
// quoted keys included); a const in the same file holding a string, an array
// of strings joined, or an object literal; and a local wrapper that forwards
// its first parameter to .rpc(), whose literal call sites are followed. What
// it cannot see (a row object built elsewhere, a spread) is counted as
// unresolved and printed, not guessed. A .from() or .rpc() on the Supabase
// client whose name is not a literal and not a followed wrapper is a problem
// in itself, so a dynamic call cannot slip past by being dynamic.

/**
 * Blank out comments, keeping strings, template literals and regex literals,
 * so that a call written in a comment is never read as a call. Newlines are
 * kept, so offsets still map to the right line.
 */
export function stripComments(src) {
  const s = String(src);
  let out = '';
  let i = 0;
  let prevSig = '';   // last significant character outside strings and comments
  let prevWord = '';
  const blank = (str) => str.replace(/[^\n]/g, ' ');
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '/' && n === '/') {
      const e = s.indexOf('\n', i);
      const stop = e < 0 ? s.length : e;
      out += blank(s.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '/' && n === '*') {
      const e = s.indexOf('*/', i + 2);
      const stop = e < 0 ? s.length : e + 2;
      out += blank(s.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      const stop = skipString(s, i);
      out += s.slice(i, stop);
      i = stop;
      prevSig = c;
      prevWord = '';
      continue;
    }
    if (c === '/' && (prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig)
        || ['return', 'typeof', 'case', 'in', 'of', 'yield', 'await'].includes(prevWord))) {
      // A regex literal: run to the closing slash outside a character class.
      let j = i + 1;
      let inClass = false;
      while (j < s.length && s[j] !== '\n') {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '[') inClass = true;
        else if (s[j] === ']') inClass = false;
        else if (s[j] === '/' && !inClass) break;
        j += 1;
      }
      out += s.slice(i, j + 1);
      i = j + 1;
      prevSig = '/';
      prevWord = '';
      continue;
    }
    out += c;
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      prevWord = /[A-Za-z0-9_$]/.test(prevSig) ? prevWord + c : c;
    } else prevWord = '';
    prevSig = c;
    i += 1;
  }
  return out;
}

/** Index just past the string or template literal that starts at i. */
function skipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === q) return j + 1;
    if (q === '`' && c === '$' && s[j + 1] === '{') {
      j = matchClose(s, j + 1) + 1;
      continue;
    }
    if (q !== '`' && c === '\n') return j; // unterminated, stop at the line end
    j += 1;
  }
  return s.length;
}

/** Index of the bracket that closes the one at `open` ((, [ or {). */
function matchClose(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[s[open]]];
  let j = open + 1;
  while (j < s.length && stack.length) {
    const c = s[j];
    if (c === '\'' || c === '"' || c === '`') { j = skipString(s, j); continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) stack.pop();
    j += 1;
  }
  return j - 1;
}

/** Split at top-level commas (outside brackets and strings). */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let j = 0; j < s.length; j += 1) {
    const c = s[j];
    if (c === '\'' || c === '"' || c === '`') { j = skipString(s, j) - 1; continue; }
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) { parts.push(s.slice(last, j)); last = j + 1; }
  }
  parts.push(s.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * The value of a string expression, or null. A template literal comes back
 * with each ${...} replaced by a placeholder, which is enough for the column
 * names in a PostgREST filter string; `template` says it happened.
 */
function stringValue(expr) {
  const e = String(expr || '').trim();
  const m = /^(['"])([\s\S]*)\1$/.exec(e);
  if (m && skipString(e, 0) === e.length) return { value: m[2], template: false };
  if (e.startsWith('`') && skipString(e, 0) === e.length) {
    let out = '';
    let template = false;
    for (let j = 1; j < e.length - 1; j += 1) {
      if (e[j] === '$' && e[j + 1] === '{') { j = matchClose(e, j + 1); out += '\u0000'; template = true; continue; }
      out += e[j];
    }
    return { value: out, template };
  }
  return null;
}

/** Top-level keys of an object literal `{ ... }`; `spread` when one is a spread. */
function objectKeys(expr, code = null) {
  const e = String(expr || '').trim();
  if (!e.startsWith('{') || matchClose(e, 0) !== e.length - 1) return null;
  const keys = [];
  let spread = false;
  for (const part of splitTop(e.slice(1, -1))) {
    if (part.startsWith('...')) {
      // `{ ...args, p_extra }` where args is a const object in the same file.
      const ident = part.slice(3).trim();
      const inner = code && /^[A-Za-z_$][\w$]*$/.test(ident) ? objectKeys(resolveConst(code, ident) || '', code) : null;
      if (inner) { keys.push(...inner.keys); spread = spread || inner.spread; } else spread = true;
      continue;
    }
    const m = /^(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*(?::|$)/.exec(part);
    if (m) keys.push(m[2] || m[3]);
    else spread = true;
  }
  return { keys, spread };
}

/**
 * Resolve an identifier to a literal declared with const in the same file:
 * a string, an array of strings with .join(sep), or an object literal.
 */
function resolveConst(code, name) {
  const re = new RegExp(`\\bconst\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*`, 'g');
  const m = re.exec(code);
  if (!m) return null;
  const j = m.index + m[0].length;
  const c = code[j];
  if (c === '\'' || c === '"' || c === '`') return code.slice(j, skipString(code, j));
  if (c === '{') return code.slice(j, matchClose(code, j) + 1);
  // `const rows = list.map((x, i) => ({ ... }))`: the row shape is the literal.
  const mapped = /^[\w$.]+\.map\(\s*(?:\([^)]*\)|[\w$]+)\s*=>\s*\(\s*\{/.exec(code.slice(j, j + 200));
  if (mapped) {
    const open = j + mapped[0].length - 1;
    return code.slice(open, matchClose(code, open) + 1);
  }
  if (c === '[') {
    const close = matchClose(code, j);
    const items = splitTop(code.slice(j + 1, close)).map((x) => stringValue(x));
    if (items.some((x) => !x || x.template)) return null;
    const tail = /^\s*\.join\(\s*(['"])(.*?)\1\s*\)/.exec(code.slice(close + 1));
    if (!tail) return null;
    return JSON.stringify(items.map((x) => x.value).join(tail[2]));
  }
  return null;
}

/** Column and embedded-resource names in a PostgREST select string. */
export function parseSelect(str) {
  const cols = [];
  const embeds = [];
  let unresolved = 0;
  let star = false;
  for (const raw of splitTop(String(str))) {
    let item = raw.trim();
    if (!item) continue;
    const paren = item.indexOf('(');
    if (paren > 0) {
      let rel = item.slice(0, paren).trim();
      if (rel.includes(':')) rel = rel.slice(rel.lastIndexOf(':') + 1);
      rel = rel.split('!')[0].trim();
      const inner = parseSelect(item.slice(paren + 1, item.lastIndexOf(')')));
      embeds.push({ rel, cols: inner.cols });
      unresolved += inner.unresolved;
      continue;
    }
    item = item.replace(/::[\w\s[\]]+$/, '');
    if (/^[A-Za-z_]\w*\s*:(?!:)/.test(item)) item = item.slice(item.indexOf(':') + 1).trim();
    item = item.split(/->>?/)[0].trim();
    if (item === '*') { star = true; continue; }
    if (/^[A-Za-z_]\w*$/.test(item)) cols.push(item);
    else unresolved += 1;
  }
  return { cols, embeds, unresolved, star };
}

/** Column names in an or()/and() filter string such as `a.eq.1,b.is.null`. */
function filterColumns(str) {
  const cols = [];
  const re = /(?:^|[,(])\s*(?:not\.)?([A-Za-z_]\w*)\.(?:not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|sl|sr|nxl|nxr|adj|fts|plfts|phfts|wfts|match|imatch)\./g;
  let m;
  while ((m = re.exec(str))) {
    if (m[1] !== 'and' && m[1] !== 'or') cols.push(m[1]);
  }
  return cols;
}

const COLUMN_FILTERS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'contains', 'containedBy', 'overlaps', 'textSearch', 'order', 'filter', 'not',
  'likeAllOf', 'likeAnyOf', 'ilikeAllOf', 'ilikeAnyOf', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent']);
const WRITES = { insert: 'insert', update: 'update', upsert: 'upsert', delete: 'delete' };
// The receivers a Supabase client goes by in this codebase. `.from()` on
// anything else (Array.from, Buffer.from) is not a table read. `service` is
// the Edge Functions' service-role client.
const CLIENT_RECEIVER = /(supabase|client|sb|admin|db|service)$/i;

const lineAt = (code, idx) => code.slice(0, idx).split('\n').length;

/** The identifier ending just before position `dot`, or ')' when a call ends there. */
function receiverBefore(code, dot) {
  let j = dot - 1;
  while (j >= 0 && /\s/.test(code[j])) j -= 1;
  if (code[j] === ')') return ')';
  let k = j;
  while (k >= 0 && /[\w$]/.test(code[k])) k -= 1;
  return code.slice(k + 1, j + 1);
}

/** The .method(args) links after position i, until the chain stops. */
function readChain(code, i) {
  const links = [];
  let j = i;
  for (;;) {
    const m = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>\s*)?\(/.exec(code.slice(j, j + 200));
    if (!m) break;
    const open = j + m[0].length - 1;
    const close = matchClose(code, open);
    links.push({ method: m[1], args: splitTop(code.slice(open + 1, close)) });
    j = close + 1;
  }
  return links;
}

/**
 * Read every Supabase call site in one source file. Returns
 *   { tables: [...], rpcs: [...], invokes: [...], dynamic: [...], unresolved: [...] }
 * with file:line on every entry.
 */
export function extractSupabaseCalls(source, file) {
  const code = stripComments(source);
  const out = { tables: [], rpcs: [], invokes: [], dynamic: [], unresolved: [] };
  const at = (idx) => `${file}:${lineAt(code, idx)}`;
  const literal = (expr) => {
    const e = String(expr || '').trim();
    let v = stringValue(e);
    if (!v && /^[A-Za-z_$][\w$]*$/.test(e)) {
      const r = resolveConst(code, e);
      v = r ? stringValue(r) : null;
    }
    return v;
  };
  const keysOf = (expr, where, what) => {
    let e = String(expr || '').trim();
    const keys = new Set();
    if (/^[A-Za-z_$][\w$]*$/.test(e)) {
      const ident = e;
      e = resolveConst(code, ident) || e;
      // `const row = { a }; row.b = ...;` is how a patch object grows here.
      if (e !== ident) {
        const grow = new RegExp(`\\b${ident.replace(/\$/g, '\\$')}\\.([A-Za-z_]\\w*)\\s*=(?!=)`, 'g');
        for (const g of code.matchAll(grow)) keys.add(g[1]);
      }
    }
    const arr = e.startsWith('[') && matchClose(e, 0) === e.length - 1;
    const objs = arr ? splitTop(e.slice(1, -1)) : [e];
    for (const o of objs) {
      const k = objectKeys(o, code);
      if (!k) { out.unresolved.push(`${where} ${what}(${e.slice(0, 30)})`); return [...keys]; }
      k.keys.forEach((x) => keys.add(x));
      if (k.spread) out.unresolved.push(`${where} ${what}: a spread or computed key`);
    }
    return [...keys];
  };

  // .from('table') chains
  const fromRe = /\.\s*from\s*(?:<[^>()]*>\s*)?\(/g;
  let m;
  while ((m = fromRe.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(code, open);
    const args = splitTop(code.slice(open + 1, close));
    const recv = receiverBefore(code, m.index);
    const onClient = CLIENT_RECEIVER.test(recv) || recv === ')';
    const name = args.length === 1 ? stringValue(args[0]) : null;
    if (!name || name.template) {
      if (CLIENT_RECEIVER.test(recv)) out.dynamic.push(`${at(m.index)} .from(${args.join(', ')}) has no literal table name`);
      continue;
    }
    if (!onClient || !/^[a-z_][a-z0-9_]*$/.test(name.value)) continue;
    const where = at(m.index);
    // readCols: selected, filtered or ordered on (Postgres wants SELECT on
    // each). writeCols: the keys of an insert, update or upsert payload.
    // star: select('*') or a bare select(), which needs every column.
    const call = { table: name.value, where, readCols: new Set(), writeCols: new Set(), embeds: [], ops: new Set(), star: false };
    for (const link of readChain(code, close + 1)) {
      const { method, args: a } = link;
      if (method === 'select') {
        call.ops.add('select');
        if (!a.length) { call.star = true; continue; }
        const v = literal(a[0]);
        if (!v || v.template) { out.unresolved.push(`${where} select(${a[0].slice(0, 30)})`); continue; }
        const sel = parseSelect(v.value);
        sel.cols.forEach((c) => call.readCols.add(c));
        if (sel.star) call.star = true;
        call.embeds.push(...sel.embeds);
        if (sel.unresolved) out.unresolved.push(`${where} select: ${sel.unresolved} item(s) not plain columns`);
      } else if (WRITES[method]) {
        call.ops.add(WRITES[method]);
        if (method !== 'delete' && a.length) keysOf(a[0], where, method).forEach((c) => call.writeCols.add(c));
        if (method === 'upsert' && a[1]) {
          const opt = /onConflict\s*:\s*(['"`])([^'"`]+)\1/.exec(a[1]);
          if (opt) opt[2].split(',').map((x) => x.trim()).filter(Boolean).forEach((c) => call.readCols.add(c));
        }
      } else if (method === 'match') {
        keysOf(a[0], where, 'match').forEach((c) => call.readCols.add(c));
      } else if (method === 'or' || method === 'and') {
        const v = literal(a[0]);
        if (v) filterColumns(v.value).forEach((c) => call.readCols.add(c));
        else out.unresolved.push(`${where} ${method}(...)`);
      } else if (COLUMN_FILTERS.has(method) && a.length) {
        const v = literal(a[0]);
        if (!v || v.template) { out.unresolved.push(`${where} ${method}(${a[0].slice(0, 30)})`); continue; }
        if (v.value.includes('.')) { out.unresolved.push(`${where} ${method}('${v.value}') on an embedded resource`); continue; }
        call.readCols.add(v.value);
      }
    }
    if (!call.ops.size) call.ops.add('select');
    out.tables.push({
      ...call,
      readCols: [...call.readCols],
      writeCols: [...call.writeCols],
      columns: [...new Set([...call.readCols, ...call.writeCols])],
      ops: [...call.ops],
    });
  }

  // .rpc('fn', { args }) and local wrappers around .rpc(param, args)
  const wrappers = new Map();
  const pushRpc = (fnExpr, argExpr, idx) => {
    const where = at(idx);
    const v = stringValue(fnExpr);
    if (!v || v.template) return false;
    let args = [];
    let resolved = true;
    if (argExpr !== undefined) {
      const e = String(argExpr).trim();
      const k = objectKeys(/^[A-Za-z_$][\w$]*$/.test(e) ? (resolveConst(code, e) || e) : e, code);
      if (!k) {
        resolved = false;
        out.unresolved.push(`${where} rpc('${v.value}', ${e.slice(0, 30)})`);
      } else {
        args = k.keys;
        if (k.spread) { resolved = false; out.unresolved.push(`${where} rpc('${v.value}') arguments: a spread`); }
      }
    }
    out.rpcs.push({ fn: v.value, where, args, resolved });
    return true;
  };
  const rpcRe = /\.\s*rpc\s*(?:<[^>()]*>\s*)?\(/g;
  while ((m = rpcRe.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(code, open);
    const args = splitTop(code.slice(open + 1, close));
    if (pushRpc(args[0], args[1], m.index)) continue;
    // Not a literal: is it a parameter of the function it sits in?
    const before = code.slice(0, m.index);
    const decls = [...before.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>)/g)];
    const decl = decls.pop();
    const params = decl ? (decl[2] ?? decl[4]).split(',').map((p) => p.trim().split('=')[0].trim()) : [];
    const pos = params.indexOf(String(args[0] || '').trim());
    if (decl && pos >= 0) {
      wrappers.set(decl[1] || decl[3], { fnPos: pos, argPos: params.indexOf(String(args[1] || '').trim()), declAt: decl.index });
    } else {
      out.dynamic.push(`${at(m.index)} .rpc(${args.join(', ').slice(0, 40)}) has no literal function name`);
    }
  }
  for (const [name, { fnPos, argPos, declAt }] of wrappers) {
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
    let w;
    let found = 0;
    while ((w = re.exec(code))) {
      if (w.index >= declAt && w.index <= declAt + 40 + name.length) continue; // the declaration itself
      const open = w.index + w[0].length - 1;
      const args = splitTop(code.slice(open + 1, matchClose(code, open)));
      if (pushRpc(args[fnPos], argPos >= 0 ? args[argPos] : undefined, w.index)) found += 1;
      else out.dynamic.push(`${at(w.index)} ${name}(${String(args[fnPos] || '').slice(0, 30)}) forwards a non-literal function name to .rpc()`);
    }
    if (!found) out.dynamic.push(`${file}: ${name}() forwards to .rpc() but no literal call of it was found`);
  }

  // The raw keepalive POST to /rest/v1/rpc/<fn>, with the JSON body after it.
  const restRe = /\/rest\/v1\/rpc\/([A-Za-z_]\w*)/g;
  while ((m = restRe.exec(code))) {
    const body = /JSON\.stringify\(\s*\{/.exec(code.slice(m.index, m.index + 1500));
    const where = at(m.index);
    if (!body) {
      out.rpcs.push({ fn: m[1], where, args: [], resolved: false });
      out.unresolved.push(`${where} POST /rest/v1/rpc/${m[1]} body`);
      continue;
    }
    const open = m.index + body.index + body[0].length - 1;
    const k = objectKeys(code.slice(open, matchClose(code, open) + 1), code);
    out.rpcs.push({ fn: m[1], where, args: k ? k.keys : [], resolved: !!k && !k.spread });
  }

  // functions.invoke('name')
  const invRe = /functions\s*\.\s*invoke\s*\(/g;
  while ((m = invRe.exec(code))) {
    const open = m.index + m[0].length - 1;
    const args = splitTop(code.slice(open + 1, matchClose(code, open)));
    const v = stringValue(args[0]);
    if (v && !v.template) out.invokes.push({ name: v.value, where: at(m.index) });
    else out.dynamic.push(`${at(m.index)} functions.invoke(${String(args[0]).slice(0, 30)}) has no literal name`);
  }
  return out;
}

/**
 * The catalogue query. Run as the database owner after every migration is
 * applied; returns one JSON document.
 */
export const CATALOGUE_SQL = `
select json_build_object(
  'relations', coalesce((
    select json_object_agg(c.relname, json_build_object(
      'kind', c.relkind,
      'columns', (select coalesce(json_agg(a.attname order by a.attnum), '[]'::json)
                  from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      -- Column grants matter: 039 and 043 revoke the table-wide SELECT and
      -- grant it back on named columns only.
      'colpriv', (select coalesce(json_object_agg(a.attname, json_build_object(
                    'authenticated', json_build_object(
                      'select', has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT'),
                      'insert', has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT'),
                      'update', has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
                    'anon', json_build_object(
                      'select', has_column_privilege('anon', c.oid, a.attnum, 'SELECT'),
                      'insert', has_column_privilege('anon', c.oid, a.attnum, 'INSERT'),
                      'update', has_column_privilege('anon', c.oid, a.attnum, 'UPDATE')))), '{}'::json)
                  from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      'priv', json_build_object(
        'authenticated', json_build_object(
          'select', has_table_privilege('authenticated', c.oid, 'SELECT'),
          'insert', has_table_privilege('authenticated', c.oid, 'INSERT'),
          'update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
          'delete', has_table_privilege('authenticated', c.oid, 'DELETE')),
        'anon', json_build_object(
          'select', has_table_privilege('anon', c.oid, 'SELECT'),
          'insert', has_table_privilege('anon', c.oid, 'INSERT'),
          'update', has_table_privilege('anon', c.oid, 'UPDATE'),
          'delete', has_table_privilege('anon', c.oid, 'DELETE')))))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')), '{}'::json),
  'functions', coalesce((
    select json_agg(json_build_object(
      'name', p.proname,
      'argnames', coalesce(p.proargnames, '{}'::text[]),
      'argmodes', coalesce(p.proargmodes::text[], '{}'::text[]),
      'nargs', p.pronargs,
      'ndefaults', p.pronargdefaults,
      'exec', json_build_object(
        'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'anon', has_function_privilege('anon', p.oid, 'EXECUTE'))))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'), '[]'::json)
)`;

/**
 * Turn the raw catalogue JSON into { relations: { name: { columns:Set, priv } },
 * functions: { name: [{ inputs, required, exec }] } }.
 */
export function normaliseCatalogue(raw) {
  const relations = {};
  for (const [name, r] of Object.entries(raw.relations || {})) {
    relations[name] = { kind: r.kind, columns: new Set(r.columns || []), priv: r.priv, colpriv: r.colpriv || {} };
  }
  const functions = {};
  for (const f of raw.functions || []) {
    const modes = f.argmodes && f.argmodes.length ? f.argmodes : null;
    const names = f.argnames || [];
    // Input arguments: mode i (in), b (inout) or v (variadic); no modes means all in.
    const inputs = modes
      ? names.filter((_, k) => ['i', 'b', 'v'].includes(modes[k]))
      : names.slice(0, f.nargs);
    const required = inputs.slice(0, Math.max(0, f.nargs - f.ndefaults));
    (functions[f.name] ||= []).push({ inputs, required, exec: f.exec });
  }
  return { relations, functions };
}

/**
 * The grants one table chain needs, as [{ priv, cols, whole }]. A column
 * grant satisfies a need when it covers every column named; `whole` marks
 * a need only a table-wide grant can meet (select('*'), a delete, a write
 * whose payload could not be read).
 */
function grantNeeds(t) {
  const needs = [];
  const read = t.readCols || t.columns || [];
  const write = t.writeCols || [];
  if (t.ops.includes('select') || read.length) needs.push({ priv: 'select', cols: read, whole: !!t.star });
  for (const op of t.ops) {
    if (op === 'insert' || op === 'upsert') needs.push({ priv: 'insert', cols: write, whole: !write.length });
    if (op === 'update' || op === 'upsert') needs.push({ priv: 'update', cols: write, whole: !write.length });
    if (op === 'delete') needs.push({ priv: 'delete', cols: [], whole: true });
  }
  return needs;
}

/**
 * Check the call sites against the catalogue. `calls` is a list of
 * { side: 'app' | 'edge', ...extractSupabaseCalls() }. Grants are checked for
 * the app only: it reaches the database as anon or authenticated, while the
 * Edge Functions use the service role. A grant to either API role counts,
 * because the source does not say whether a call runs signed in. Row level
 * security is not judged here; test_rls_policies.mjs does that.
 */
export function validateDbContract({ calls, catalogue, edgeFunctions }) {
  const problems = [];
  const bad = (m) => problems.push(m);
  const { relations, functions } = catalogue;
  for (const c of calls) {
    for (const t of c.tables) {
      const rel = relations[t.table];
      if (!rel) { bad(`${t.where} uses table "${t.table}", which no migration creates`); continue; }
      for (const col of t.columns) {
        if (!rel.columns.has(col)) bad(`${t.where} uses column "${t.table}.${col}", which no migration defines`);
      }
      for (const e of t.embeds) {
        const er = relations[e.rel];
        if (!er) { bad(`${t.where} embeds "${e.rel}" in a select on "${t.table}", and no such table exists`); continue; }
        for (const col of e.cols) if (!er.columns.has(col)) bad(`${t.where} embeds column "${e.rel}.${col}", which no migration defines`);
      }
      if (c.side === 'app') {
        const needs = grantNeeds(t);
        const fits = (role) => needs.every(({ priv, cols, whole }) => rel.priv?.[role]?.[priv]
          || (!whole && cols.length > 0 && cols.every((col) => rel.colpriv?.[col]?.[role]?.[priv])));
        if (!fits('authenticated') && !fits('anon')) {
          const say = needs.map(({ priv, cols, whole }) => `${priv.toUpperCase()}${whole ? ' on the whole table' : cols.length ? ` (${cols.join(', ')})` : ''}`).join(' + ');
          bad(`${t.where} needs ${say} on "${t.table}", and neither anon nor authenticated holds it`);
        }
      }
    }
    for (const r of c.rpcs) {
      const overloads = functions[r.fn];
      if (!overloads) { bad(`${r.where} calls rpc "${r.fn}", which no migration creates`); continue; }
      if (r.resolved) {
        const fits = overloads.filter((o) => r.args.every((a) => o.inputs.includes(a))
          && o.required.every((a) => r.args.includes(a)));
        if (!fits.length) {
          const sig = overloads.map((o) => `(${o.inputs.map((a) => (o.required.includes(a) ? a : `${a}?`)).join(', ')})`).join(' or ');
          bad(`${r.where} calls ${r.fn}(${r.args.join(', ')}), but the function takes ${sig}`);
          continue;
        }
      }
      if (c.side === 'app' && !overloads.some((o) => o.exec?.authenticated || o.exec?.anon)) {
        bad(`${r.where} calls rpc "${r.fn}", and neither anon nor authenticated may execute it`);
      }
    }
    for (const inv of c.invokes) {
      if (!edgeFunctions.has(inv.name)) bad(`${inv.where} invokes Edge Function "${inv.name}", and supabase/functions/${inv.name} does not exist`);
    }
  }
  return problems;
}
