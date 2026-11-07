/**
 * contract.mjs, the app_data.json contract, written down as code.
 *
 * ONE CONTRACT, THREE READERS (T1133, ROADMAP D1)
 *
 * docs/wire.schema.json is the machine-readable contract of
 * public/app_data.json: every meta key and every destination key, the type,
 * range or enum of each, and its presence (required, every, some). It is
 * read by the pipeline writers (pipeline/wire_contract.py, before each write
 * of the wire), by the app sync (scripts/sync-data.mjs, before it writes
 * public/) and here, by the CI gate. The interpreter is
 * src/lib/wireSchema.js, pure so it can also run at hydration time; its
 * Python twin words every problem the same way, starting with the field
 * path. The "Wire contract" table in docs/SCHEMA.md is generated from the
 * schema (node scripts/ci/wire-table.mjs --write) and the gate fails when
 * the two drift.
 *
 * What stays in this file: the relations a per-value schema cannot say (a
 * record's id matches its key, a city's gateways point back at it, every
 * rated record carries a taste profile), the split wires, the nature, POI
 * and trail wires, and the database half.
 *
 * WHAT COUNTS AS REQUIRED
 *
 * Deliberately narrow, and written in the schema's `required` lists: a field
 * is required on every payload only when the app is visibly broken without
 * it. meta.schema_version, the currency, the date window, the defaults block
 * and the baggage options are read on the boot path; per destination an id,
 * a tier, a city, a country, an iso2 and finite coordinates. Everything else
 * is a layer the app degrades through on purpose, so its presence is checked
 * only on a full catalogue (`catalogue: true`, x-presence in the schema).
 *
 * The version is pinned to what the SHIPPED payload carries: the schema's
 * x-schema-version, which must equal its own meta.schema_version const and
 * the "`meta.schema_version` = N" header line of docs/SCHEMA.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWire, schemaKeySet, SCHEMA_NAME } from '../../src/lib/wireSchema.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WIRE_SCHEMA_PATH = process.env.CARTA_WIRE_SCHEMA
  || path.join(process.env.CARTA_REPO_ROOT || path.join(HERE, '..', '..', '..'), 'docs', 'wire.schema.json');

/** Parse docs/wire.schema.json (or the file at `file`). */
export function loadWireSchema(file = WIRE_SCHEMA_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export const WIRE_SCHEMA = loadWireSchema();
export const EXPECTED_SCHEMA_VERSION = WIRE_SCHEMA['x-schema-version'];

// Top-level keys the boot path reads before it can render a price, and the
// per-destination fields with no fallback anywhere in the app.
const REQUIRED_META = WIRE_SCHEMA.properties.meta.required;
const REQUIRED_DEST = WIRE_SCHEMA.$defs.destination.required;

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** The schema's own consistency: version pins agree, required keys are listed. */
export function checkWireSchema(schema = WIRE_SCHEMA) {
  const problems = [];
  const v = schema['x-schema-version'];
  const metaProps = schema?.properties?.meta?.properties || {};
  const destProps = schema?.$defs?.destination?.properties || {};
  if (!Number.isInteger(v)) problems.push(`${SCHEMA_NAME} has no integer x-schema-version`);
  if (metaProps.schema_version?.const !== v) {
    problems.push(`${SCHEMA_NAME}: meta.schema_version const is ${JSON.stringify(metaProps.schema_version?.const)}, x-schema-version is ${v}`);
  }
  for (const k of schema?.properties?.meta?.required || []) if (!(k in metaProps)) problems.push(`${SCHEMA_NAME}: required meta key "${k}" has no property`);
  for (const k of schema?.$defs?.destination?.required || []) if (!(k in destProps)) problems.push(`${SCHEMA_NAME}: required destination key "${k}" has no property`);
  for (const [k, p] of Object.entries(metaProps)) if (p['x-presence'] !== 'required') problems.push(`${SCHEMA_NAME}: meta key "${k}" must have x-presence "required"`);
  for (const [k, p] of Object.entries(destProps)) {
    if (!['every', 'some'].includes(p['x-presence'])) problems.push(`${SCHEMA_NAME}: destination key "${k}" must have x-presence "every" or "some"`);
    if (typeof p.description !== 'string' || !p.description) problems.push(`${SCHEMA_NAME}: destination key "${k}" has no description`);
  }
  // A vacuous gate on an emptied schema is the failure to rule out.
  if (Object.keys(metaProps).length < 10 || Object.keys(destProps).length < 20) {
    problems.push(`${SCHEMA_NAME} lists ${Object.keys(metaProps).length} meta and ${Object.keys(destProps).length} destination keys; expected at least 10 and 20`);
  }
  return problems;
}

/**
 * Validate a parsed app_data payload. Returns an array of problem strings,
 * each starting with the field path; empty means it passes.
 *
 * The per-value rules come from docs/wire.schema.json (validateWire): a key
 * the schema does not list fails, so a renamed or new field has to be
 * written into the schema in the same change. `catalogue: true` adds the
 * presence half, which only makes sense on a real catalogue and not on the
 * trimmed fixture: every meta key is there, every "every" key is on every
 * destination, every "some" key is on at least one, and the relations below
 * hold across records.
 */
export function validateAppData(data, { catalogue = false, schema = WIRE_SCHEMA } = {}) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return ['payload is not an object'];
  }
  const problems = validateWire(data, schema, { catalogue });
  const dests = data.destinations;
  if (dests && typeof dests === 'object' && !Array.isArray(dests)) {
    problems.push(...checkRelations(dests, { catalogue }));
  }
  return problems;
}

export class WireContractError extends Error {
  constructor(label, problems) {
    const head = problems.slice(0, 12).join('\n  ');
    const more = problems.length > 12 ? `\n  ... ${problems.length - 12} more` : '';
    super(`refusing to write ${label}: the payload breaks ${SCHEMA_NAME}\n  ${head}${more}`);
    this.name = 'WireContractError';
    this.problems = problems;
  }
}

/**
 * The write guard, the JS twin of pipeline/wire_contract.py's check_wire:
 * throws WireContractError, naming each field path, when `data` breaks the
 * schema. Shape only (no presence), as on the pipeline side.
 */
export function assertWire(data, label = 'public/app_data.json', { schema = WIRE_SCHEMA } = {}) {
  const problems = validateAppData(data, { schema });
  if (problems.length) throw new WireContractError(label, problems);
}

// ======================================================================
// Schema v19 enums (T762), still used by the nature and POI wires below.
// The destination-level v19 rules (rating.band, class_rank, confidence,
// taste.likes and the rest) live in docs/wire.schema.json since T1133.
// ======================================================================

export const V19_BANDS = ['exceptional', 'excellent', 'very_good', 'good', 'pleasant'];
export const V19_CONFIDENCE = ['curated', 'rubric', 'estimated'];
export const V19_LIKES = ['beach', 'hiking', 'lakes', 'culture', 'city', 'food',
  'nightlife', 'hidden', 'cycling', 'ski', 'wellness', 'islands'];
export const V19_CLASSES = ['metro', 'city', 'town', 'village', 'area'];
export const V19_POI_LABELS = ['must_see', 'recommended', 'worth_a_look'];
export const V19_POI_CATEGORIES = ['sights', 'museums', 'nature', 'food_drink',
  'active', 'family', 'nightlife', 'markets'];
export const V19_NATURE_CONFIDENCE = ['measured', 'partial', 'unscored'];
export const V19_UNMEASURED = ['food', 'nightlife'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The relations across records that a per-value schema cannot say.
function checkRelations(dests, { catalogue }) {
  const problems = [];
  const bad = (m) => problems.push(m);
  let rated = 0;
  let withTaste = 0;
  for (const [key, d] of Object.entries(dests)) {
    if (!isObj(d)) continue;
    const where = `destinations.${key}`;
    if (d.id !== undefined && d.id !== key) {
      bad(`${where}.id is ${JSON.stringify(d.id)}, does not match its key`);
    }
    if (isObj(d.rating)) rated += 1;
    if ('taste' in d) withTaste += 1;
    if (catalogue && Array.isArray(d.gateways)) {
      for (const g of d.gateways) {
        if (dests[g]?.gateway_of !== key) {
          bad(`${where}.gateways lists ${JSON.stringify(g)}, whose gateway_of is not ${key}`);
        }
      }
    }
  }
  // Pair the walk with a count: a catalogue with no rated or no profiled
  // destination would pass every check above vacuously.
  if (catalogue && rated && withTaste < rated) {
    bad(`destinations.*.taste is on ${withTaste} of ${rated} rated destinations; every rated one carries it`);
  }
  return problems;
}

/** POI shards: label, category and tags on every item (v19). */
export function validateV19Pois(shards) {
  const problems = [];
  for (const [name, items] of Object.entries(shards)) {
    if (!Array.isArray(items)) continue;
    items.forEach((it, i) => {
      const where = `poi/${name}[${i}]`;
      if (!('label' in it)) problems.push(`${where}.label is missing`);
      else if (it.label !== null && !V19_POI_LABELS.includes(it.label)) problems.push(`${where}.label is ${JSON.stringify(it.label)}`);
      if (!V19_POI_CATEGORIES.includes(it.category)) problems.push(`${where}.category is ${JSON.stringify(it.category)}`);
      if (!isObj(it.tags)) problems.push(`${where}.tags is not an object`);
    });
  }
  return problems;
}

/** Nature rows ({kind: [row]}): every rated row carries v5 {score, band, rank, facts, confidence}. */
export function validateNatureWires(byKind) {
  const problems = [];
  let n = 0;
  for (const [kind, rows] of Object.entries(byKind)) {
    for (const row of rows) {
      const v = row.v5;
      const where = `${kind}/${row.id}`;
      n += 1;
      if (!isObj(v)) { problems.push(`${where}.v5 is missing`); continue; }
      if (!V19_NATURE_CONFIDENCE.includes(v.confidence)) problems.push(`${where}.v5.confidence is ${JSON.stringify(v.confidence)}`);
      if (!isObj(v.facts)) problems.push(`${where}.v5.facts is not an object`);
      if (v.confidence === 'unscored') {
        if (v.score !== null || v.band !== null) problems.push(`${where}.v5 is unscored but carries a score`);
        continue;
      }
      if (!isFiniteNum(v.score) || v.score < 0 || v.score > 10) problems.push(`${where}.v5.score is ${JSON.stringify(v.score)}`);
      if (v.band !== null && !V19_BANDS.includes(v.band)) problems.push(`${where}.v5.band is ${JSON.stringify(v.band)}`);
      if (v.rank !== null && !(isObj(v.rank) && ['region', 'country'].includes(v.rank.scope)
        && Number.isInteger(v.rank.rank) && Number.isInteger(v.rank.of)
        && v.rank.rank >= 1 && v.rank.rank <= v.rank.of && typeof v.rank.unit === 'string')) {
        problems.push(`${where}.v5.rank is ${JSON.stringify(v.rank)}`);
      }
    }
  }
  if (!n) problems.push('no rated nature row was read');
  return problems;
}

/**
 * Trail card photographs (T1093, D7 and K2). Every trail row's `img` that
 * carries a licence must carry one that allows reuse with credit (CC0, CC BY,
 * CC BY-SA, public domain: the same rule as pipeline/trails/photo_licence.py),
 * and a licence that is not CC0 or public domain must name the photographer.
 * Once any row carries `lic` the wire has been rebuilt, so every `img` must:
 * a half-credited wire is the break this exists for. Before the first rebuilt
 * wire (no row has `lic`) rows are only counted, and the result says so.
 */
const TRAIL_LIC_OK = /^(public domain|pd\b|pd-|cc0|cc-0|cc zero|no restrictions|cc[ -]by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?)?(?:[ -][a-z]{2,3})?$)/i;
const TRAIL_LIC_NO_NAME = /^(public domain|pd\b|pd-|cc0|cc-0|cc zero|no restrictions)/i;
export function validateTrailImages(rows) {
  const problems = [];
  const withImg = rows.filter((r) => r && r.img);
  const rebuilt = withImg.some((r) => r.img.lic);
  for (const r of withImg) {
    const { img } = r;
    const where = `trails/${r.id}.img`;
    if (!img.lic) {
      if (rebuilt) problems.push(`${where} has no licence in a rebuilt wire`);
      continue;
    }
    const lic = String(img.lic).replace(/_/g, ' ').trim();
    if (/(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv/i.test(lic) || !TRAIL_LIC_OK.test(lic)) {
      problems.push(`${where} carries licence ${JSON.stringify(img.lic)}, which does not allow reuse with credit`);
    } else if (!TRAIL_LIC_NO_NAME.test(lic) && !String(img.by || '').trim()) {
      problems.push(`${where} is ${lic} and names no photographer`);
    }
  }
  return { problems, n: withImg.length, rebuilt };
}

/**
 * Multi-stage treks (T1184, ROADMAP D24, docs/SCHEMA.md "Multi-stage treks").
 * `files` maps a country code to its parsed trails file. Each `treks[]`
 * record needs an id unique across the wire, a name, the country it is
 * filed under, two or more stages with distinct ids and strictly rising
 * numbers, a `km` total that is the sum of its stages, and the T1143
 * provenance pair (`_src`, `_asof`). Every stage row's `trek {id, cc, i}`
 * must name a trek in that country's file that lists the row under that
 * number, and every listed stage must point back. A wire with no treks yet
 * passes and says so (the export has not run since T1184).
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function validateTrailTreks(files) {
  const problems = [];
  const treks = new Map();
  for (const [cc, doc] of Object.entries(files || {})) {
    for (const t of (doc && doc.treks) || []) {
      const where = `trails/${cc}.treks/${t && t.id}`;
      if (!t || !t.id) { problems.push(`trails/${cc}.treks has a record with no id`); continue; }
      if (treks.has(t.id)) problems.push(`${where} is filed twice`);
      treks.set(t.id, { cc, t });
      if (!String(t.name || '').trim()) problems.push(`${where} has no name`);
      if (t.cc !== cc) problems.push(`${where} says cc ${t.cc} but is filed in ${cc}`);
      const st = Array.isArray(t.stages) ? t.stages : [];
      if (st.length < 2) problems.push(`${where} has ${st.length} stage(s)`);
      if (new Set(st.map((x) => String(x.id))).size !== st.length) problems.push(`${where} lists a stage twice`);
      for (let k = 1; k < st.length; k += 1) {
        if (!(st[k].i > st[k - 1].i)) { problems.push(`${where} stage numbers do not rise at ${st[k].id}`); break; }
      }
      const sum = st.reduce((a, x) => a + (Number.isFinite(x.km) ? x.km : 0), 0);
      if (!Number.isFinite(t.km) || Math.abs(sum - t.km) > 0.05 * st.length + 0.1) {
        problems.push(`${where} km ${t.km} is not the sum of its stages (${sum.toFixed(1)})`);
      }
      if (t.n !== st.length) problems.push(`${where} n ${t.n} but ${st.length} stages`);
      // T1201 (T1184-e): the whole path's stage count, when the superroute gives it.
      if (t.of !== undefined) {
        const top = st.reduce((a, x) => Math.max(a, Number(x.i) || 0), 0);
        if (!Number.isInteger(t.of) || t.of < st.length || t.of < top) problems.push(`${where} of ${t.of} is under its published stages`);
      }
      if (!String(t._src || '').trim() || !ISO_DAY.test(String(t._asof || ''))) {
        problems.push(`${where} misses _src or _asof`);
      }
    }
  }
  let rowsWithTrek = 0;
  const pointed = new Set();
  for (const [cc, doc] of Object.entries(files || {})) {
    for (const r of [...((doc && doc.trips) || []), ...((doc && doc.listed) || [])]) {
      if (!r || !r.trek) continue;
      rowsWithTrek += 1;
      const where = `trails/${cc}/${r.id}.trek`;
      const hit = treks.get(r.trek.id);
      if (!hit) { problems.push(`${where} points at ${r.trek.id}, which no file holds`); continue; }
      if (hit.cc !== r.trek.cc) problems.push(`${where} says cc ${r.trek.cc}, the trek is in ${hit.cc}`);
      const stage = hit.t.stages.find((x) => String(x.id) === String(r.id));
      if (!stage) problems.push(`${where} is not a stage of ${r.trek.id}`);
      else if (stage.i !== r.trek.i) problems.push(`${where} says stage ${r.trek.i}, the trek says ${stage.i}`);
      pointed.add(`${r.trek.id}|${r.id}`);
    }
  }
  const loaded = new Set(Object.values(files || {}).flatMap((d) => [...((d && d.trips) || []), ...((d && d.listed) || [])].map((r) => String(r.id))));
  for (const [id, { t }] of treks) {
    for (const x of t.stages || []) {
      if (loaded.has(String(x.id)) && !pointed.has(`${id}|${x.id}`)) {
        problems.push(`trails/${t.cc}.treks/${id} lists ${x.id}, whose row does not point back`);
      }
    }
  }
  return { problems, n: treks.size, rows: rowsWithTrek };
}

/**
 * The way back for one-way walks (T1185, ROADMAP D24, docs/SCHEMA.md "Way
 * back"). `wb` sits on a one-way row that is not a trek stage and on a trek
 * record. It needs a positive straight-line `km`, `_src` and `_asof`, a taxi
 * that is flagged `est` with a whole-5 minute time, and, where `pt` is
 * present, lists of modes with `both` the intersection of `s` and `e`. No
 * public transport minutes are allowed: the repo holds no timetable.
 */
const WB_MODES = new Set(['rail', 'bus', 'ferry']);
export function validateTrailWayBack(files) {
  const problems = [];
  let n = 0;
  const check = (wb, where) => {
    n += 1;
    if (!Number.isFinite(wb.km) || wb.km <= 0) problems.push(`${where}.wb km ${wb.km} is not positive`);
    if (!String(wb._src || '').trim() || !ISO_DAY.test(String(wb._asof || ''))) problems.push(`${where}.wb misses _src or _asof`);
    if (wb.taxi) {
      if (wb.taxi.est !== true) problems.push(`${where}.wb taxi is not flagged as an estimate`);
      if (!Number.isInteger(wb.taxi.min) || wb.taxi.min % 5 !== 0 || wb.taxi.min <= 0) problems.push(`${where}.wb taxi minutes ${wb.taxi.min} are not a positive multiple of 5`);
    }
    if (wb.pt) {
      const ok = (l) => Array.isArray(l) && l.every((m) => WB_MODES.has(m));
      if (!ok(wb.pt.s) || !ok(wb.pt.e) || !ok(wb.pt.both)) problems.push(`${where}.wb pt has a bad mode list`);
      else if (wb.pt.both.some((m) => !wb.pt.s.includes(m) || !wb.pt.e.includes(m))) problems.push(`${where}.wb pt.both is not in both ends`);
      if ('min' in wb.pt) problems.push(`${where}.wb pt carries minutes, which no timetable backs`);
    }
  };
  for (const [cc, doc] of Object.entries(files || {})) {
    for (const t of (doc && doc.treks) || []) if (t && t.wb) check(t.wb, `trails/${cc}.treks/${t.id}`);
    for (const r of [...((doc && doc.trips) || []), ...((doc && doc.listed) || [])]) {
      if (!r || !r.wb) continue;
      check(r.wb, `trails/${cc}/${r.id}`);
      if (r.trek) problems.push(`trails/${cc}/${r.id} is a trek stage and carries its own wb`);
    }
  }
  return { problems, n };
}

/**
 * Validate the split wires that sit beside app_data.json (T267, closing the
 * gap T029 recorded): the boot index, the per-country destination files it
 * names, the per-destination POI shards and the country insights (the
 * per-origin fare slices went in T511). The checks are structural and
 * narrow, in the same spirit as validateAppData: a field is required here
 * only when the app is visibly broken without it.
 *
 *   boot          parsed public/boot.json
 *   chunkNames    basenames of the files that exist in public/dest/
 *   chunks        { name: parsed file } for a sample of those files
 *   poiShards     { name: parsed file } for a sample of public/poi/
 *   insights      parsed public/country_insights.json
 *
 * Every walk is paired with a minimum count, so an empty sample cannot pass
 * vacuously. `poiMin` lowers the POI floor to 0 only where the shards cannot
 * exist (a git checkout in CI, T082); the caller says so out loud.
 */
export function validateSplitWires({ boot, chunkNames = null, chunks = {}, poiShards = {}, insights = null } = {}, { poiMin = 1 } = {}) {
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

  if (insights === null || typeof insights !== 'object' || Array.isArray(insights)
      || Object.keys(insights).length < 1) {
    bad('country_insights.json is not a non-empty object');
  }

  return problems;
}

// ======================================================================
// The documented key set (T082, generated from the schema since T1133)
// ======================================================================
//
// The full key set of meta and of a destination is pinned in
// docs/wire.schema.json. docs/SCHEMA.md keeps the human table ("Wire
// contract"), generated from the schema between two marker comments by
// scripts/ci/wire-table.mjs. The gate parses the table back and fails when
// it and the schema disagree on any key, block or presence, or when the
// header's version is not the schema's, so the document cannot drift from
// the wire again (the header said version 15 for months while 17 shipped).

export const TABLE_START = '<!-- wire-table:start, generated from docs/wire.schema.json by continent-app/scripts/ci/wire-table.mjs; do not edit by hand -->';
export const TABLE_END = '<!-- wire-table:end -->';

/** The "Wire contract" table rows, rendered from the schema. */
export function renderWireTable(schema = WIRE_SCHEMA) {
  const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  const lines = ['| Key | Block | Presence | Described |', '|---|---|---|---|'];
  for (const [k, p] of Object.entries(schema.properties.meta.properties)) {
    lines.push(`| \`${k}\` | meta | ${p['x-presence']} | ${cell(p.description)} |`);
  }
  for (const [k, p] of Object.entries(schema.$defs.destination.properties)) {
    lines.push(`| \`${k}\` | destination | ${p['x-presence']} | ${cell(p.description)} |`);
  }
  return lines.join('\n');
}

/** Replace the generated table in docs/SCHEMA.md's text; returns the new text. */
export function writeWireTable(markdown, schema = WIRE_SCHEMA) {
  const a = markdown.indexOf(TABLE_START);
  const b = markdown.indexOf(TABLE_END);
  if (a < 0 || b < a) throw new Error('docs/SCHEMA.md has no wire-table markers');
  return `${markdown.slice(0, a + TABLE_START.length)}\n${renderWireTable(schema)}\n${markdown.slice(b)}`;
}

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

/**
 * docs/SCHEMA.md against the schema: the table lists the same keys, in the
 * same blocks, with the same presence, the generated rows are current, and
 * the header line carries the schema's version. Returns problem strings.
 */
export function checkSchemaTable(markdown, schema = WIRE_SCHEMA) {
  const doc = parseSchemaContract(markdown);
  const problems = [...doc.problems];
  const want = schemaKeySet(schema);
  if (doc.version !== want.version) {
    problems.push(`docs/SCHEMA.md says meta.schema_version ${doc.version}, ${SCHEMA_NAME} says ${want.version}; change both in the same commit`);
  }
  const diff = (label, a, b) => {
    for (const k of b) if (!a.has(k)) problems.push(`docs/SCHEMA.md's wire contract lacks ${label} key "${k}" that ${SCHEMA_NAME} lists`);
    for (const k of a) if (!b.has(k)) problems.push(`docs/SCHEMA.md's wire contract lists ${label} key "${k}" that ${SCHEMA_NAME} does not`);
  };
  diff('meta', doc.meta, want.meta);
  diff('destination "every"', doc.every, want.every);
  diff('destination "some"', doc.some, want.some);
  const a = markdown.indexOf(TABLE_START);
  const b = markdown.indexOf(TABLE_END);
  if (a < 0 || b < a) problems.push('docs/SCHEMA.md has no wire-table markers around the table');
  else if (markdown.slice(a + TABLE_START.length, b).trim() !== renderWireTable(schema)) {
    problems.push('docs/SCHEMA.md\'s wire table is not the one the schema renders; run node continent-app/scripts/ci/wire-table.mjs --write');
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
