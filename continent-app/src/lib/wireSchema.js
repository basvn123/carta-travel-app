/**
 * wireSchema.js, the wire contract interpreter (T1133, ROADMAP D1).
 *
 * docs/wire.schema.json is the one machine-readable contract for
 * public/app_data.json. Three readers share it:
 *   - the pipeline writers, through pipeline/wire_contract.py (the Python
 *     twin of this file), before every write of the wire;
 *   - the app sync, scripts/sync-data.mjs, before it writes public/;
 *   - the CI gate, scripts/ci/contract.mjs and check-contract.mjs.
 * Both twins interpret the same JSON Schema 2020-12 subset and word every
 * problem the same way, starting with the field path, so a seeded bad value
 * fails pytest and npm test with the same message
 * (tests/fixtures/wire_contract_cases.json holds the shared cases).
 *
 * Keywords: type, enum, const, pattern, minLength, minimum, maximum, items,
 * prefixItems, minItems, maxItems, properties, required,
 * additionalProperties, minProperties, $ref (local #/$defs/ only), plus
 * x-presence (required | every | some), checked only with catalogue: true.
 *
 * Pure: no Node or DOM APIs, the caller passes the parsed schema in, so the
 * same function can run at hydration time in the browser.
 */

export const SCHEMA_NAME = 'docs/wire.schema.json';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function show(v) {
  const s = JSON.stringify(v === undefined ? null : v);
  return s.length <= 80 ? s : `${s.slice(0, 77)}...`;
}

function isType(v, t) {
  switch (t) {
    case 'null': return v === null;
    case 'boolean': return typeof v === 'boolean';
    case 'string': return typeof v === 'string';
    case 'number': return isNum(v);
    case 'integer': return isNum(v) && Number.isInteger(v);
    case 'array': return Array.isArray(v);
    case 'object': return isObj(v);
    default: throw new Error(`${SCHEMA_NAME}: unknown type ${JSON.stringify(t)}`);
  }
}

// Deep equality on JSON values, for const and enum.
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => same(a[k], b[k]));
}

const join = (path, key) => (path ? `${path}.${key}` : String(key));

/**
 * Validate a parsed payload against the parsed schema. Returns an array of
 * problem strings, each starting with the field path; empty means it passes.
 */
export function validateWire(data, schema, { catalogue = false } = {}) {
  const problems = [];
  const patterns = new Map();
  const re = (p) => {
    if (!patterns.has(p)) patterns.set(p, new RegExp(p, 'u'));
    return patterns.get(p);
  };

  const resolve = (s) => {
    let out = s;
    while (out.$ref) {
      const ref = out.$ref;
      if (!ref.startsWith('#/$defs/')) throw new Error(`${SCHEMA_NAME}: only local $defs refs, got ${ref}`);
      const target = schema.$defs[ref.slice('#/$defs/'.length)];
      const rest = { ...out };
      delete rest.$ref;
      out = { ...target, ...rest };
    }
    return out;
  };

  const walk = (v, s0, path) => {
    const s = resolve(s0);
    if ('type' in s) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => isType(v, t))) {
        problems.push(`${path} is ${show(v)}, expected ${types.join(' or ')}`);
        return;
      }
    }
    if ('const' in s && !same(v, s.const)) {
      problems.push(`${path} is ${show(v)}, expected ${show(s.const)}`);
      return;
    }
    if ('enum' in s && !s.enum.some((e) => same(v, e))) {
      problems.push(`${path} is ${show(v)}, expected one of ${show(s.enum)}`);
      return;
    }
    if (typeof v === 'string') {
      // Python's len() counts code points, so count them here too.
      if ('minLength' in s && [...v].length < s.minLength) problems.push(`${path} is ${show(v)}, shorter than ${s.minLength}`);
      if ('pattern' in s && !re(s.pattern).test(v)) problems.push(`${path} is ${show(v)}, does not match ${s.pattern}`);
    }
    if (isNum(v)) {
      if ('minimum' in s && v < s.minimum) problems.push(`${path} is ${show(v)}, below the minimum ${s.minimum}`);
      if ('maximum' in s && v > s.maximum) problems.push(`${path} is ${show(v)}, above the maximum ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if ('minItems' in s && v.length < s.minItems) problems.push(`${path} has ${v.length} items, expected at least ${s.minItems}`);
      if ('maxItems' in s && v.length > s.maxItems) problems.push(`${path} has ${v.length} items, expected at most ${s.maxItems}`);
      const prefix = s.prefixItems || [];
      v.forEach((item, i) => {
        const sub = i < prefix.length ? prefix[i] : s.items;
        if (sub !== undefined) walk(item, sub, `${path}[${i}]`);
      });
    }
    if (isObj(v)) walkObject(v, s, path);
  };

  const walkObject = (v, s, path) => {
    const props = s.properties || {};
    const required = s.required || [];
    for (const k of required) if (!(k in v)) problems.push(`${join(path, k)} is missing`);
    if (catalogue) {
      for (const [k, ps] of Object.entries(props)) {
        if (ps['x-presence'] === 'required' && !(k in v) && !required.includes(k)) {
          problems.push(`${join(path, k)} is missing`);
        }
      }
    }
    const n = Object.keys(v).length;
    if ('minProperties' in s && n < s.minProperties) problems.push(`${path} has ${n} entries, expected at least ${s.minProperties}`);
    const extra = 'additionalProperties' in s ? s.additionalProperties : true;
    for (const [k, item] of Object.entries(v)) {
      if (Object.prototype.hasOwnProperty.call(props, k)) walk(item, props[k], join(path, k));
      else if (extra === false) {
        problems.push(`${join(path, k)} is not in the wire contract; add it to ${SCHEMA_NAME} or put the old name back`);
      } else if (isObj(extra)) walk(item, extra, join(path, k));
    }
    if (catalogue && isObj(extra)) records(v, resolve(extra), path);
  };

  // A map of records (destinations): "every" and "some" across them.
  const records = (v, rs, path) => {
    const rows = Object.values(v).filter(isObj);
    for (const [k, ps] of Object.entries(rs.properties || {})) {
      const pres = ps['x-presence'];
      const n = rows.filter((r) => k in r).length;
      if (pres === 'every' && n < rows.length) {
        problems.push(`${path}.*.${k} is "every" in ${SCHEMA_NAME} but ${rows.length - n} of ${rows.length} records lack it`);
      } else if (pres === 'some' && rows.length && n === 0) {
        problems.push(`${path}.*.${k} is listed in ${SCHEMA_NAME} but no record carries it (renamed or dropped?)`);
      }
    }
  };

  walk(data, schema, '');
  return problems;
}

/** The key set the schema documents: { version, meta, every, some }. */
export function schemaKeySet(schema) {
  const meta = new Set(Object.keys(schema?.properties?.meta?.properties || {}));
  const every = new Set();
  const some = new Set();
  for (const [k, p] of Object.entries(schema?.$defs?.destination?.properties || {})) {
    if (p['x-presence'] === 'every') every.add(k);
    else if (p['x-presence'] === 'some') some.add(k);
  }
  const version = schema?.['x-schema-version'] ?? null;
  return { version, meta, every, some };
}
