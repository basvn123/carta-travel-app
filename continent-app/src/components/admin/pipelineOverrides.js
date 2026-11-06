// Pipeline overrides (ROADMAP I13, T1173): the pure half of the admin
// Overrides tab. The rules mirror pipeline/apply_overrides.py entry_problems,
// so a draft the admin downloads is one the pipeline accepts. Nothing here
// writes anywhere: the admin downloads the layer file or copies the pull
// request text, and the change lands through git like any other.

export const LAYERS = ['dest', 'beach', 'lake', 'mountain'];

export const LAYER_LABEL = { dest: 'Places', beach: 'Beaches', lake: 'Lakes', mountain: 'Mountains' };

// Fields worth suggesting per layer; any dotted path the record carries works.
export const FIELD_HINTS = {
  dest: ['blurb', 'city', 'image', 'place.visit_h', 'tags'],
  beach: ['name', 'why', 'images', 'tags'],
  lake: ['name', 'why', 'images', 'tags'],
  mountain: ['name', 'why', 'images', 'ele'],
};

export const VALUE_KINDS = ['text', 'number', 'yes or no', 'JSON'];

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DASH_RE = /[\u2013\u2014]/;
// Mirrors COMPUTED in pipeline/apply_overrides.py: prices, scores and tiers are
// fixed at their source, never patched over.
export const COMPUTED = ['costs', 'accommodation', 'rating', 'score', 'v5', 'comp', 'tier'];
export const WHY_MIN = 10;
export const WHY_MAX = 500;

export function emptyDraft(today = new Date().toISOString().slice(0, 10)) {
  return { layer: 'dest', id: '', path: '', kind: 'text', value: '', who: '', when: today, why: '', source: '', reviewBy: '' };
}

function validDate(s) {
  if (!DATE_RE.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The draft's value in the type the admin chose, or { error }. */
export function parseValue(kind, raw) {
  const text = String(raw ?? '');
  if (kind === 'text') return text.trim() ? { value: text.trim() } : { error: 'Write the new value' };
  if (kind === 'number') {
    const n = Number(text.trim());
    return text.trim() && Number.isFinite(n) ? { value: n } : { error: 'The value is not a number' };
  }
  if (kind === 'yes or no') {
    if (/^(true|yes)$/i.test(text.trim())) return { value: true };
    if (/^(false|no)$/i.test(text.trim())) return { value: false };
    return { error: 'Write yes or no' };
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'The value is not valid JSON' };
  }
}

/** Every rule the draft breaks, as { field, message }. Empty when it is ready. */
export function draftProblems(draft, existing = []) {
  const out = [];
  const add = (field, message) => out.push({ field, message });
  if (!LAYERS.includes(draft.layer)) add('layer', 'Pick a layer');
  const id = (draft.id || '').trim();
  if (!id || id.length > 200) add('id', 'Write the item id as the wire has it');
  const path = (draft.path || '').trim();
  if (!PATH_RE.test(path)) add('path', 'Write a field name, dotted for a nested one (place.visit_h)');
  else if (path.split('.')[0] === 'id') add('path', 'An override may not change the id');
  else if (COMPUTED.includes(path.split('.')[0])) add('path', 'Prices, scores and tiers are computed; fix them at their source');
  const parsed = parseValue(draft.kind, draft.value);
  if (parsed.error) add('value', parsed.error);
  const who = (draft.who || '').trim();
  if (!who || who.length > 80) add('who', 'Say who made the correction');
  if (!validDate(draft.when)) add('when', 'Write the date as YYYY-MM-DD');
  const why = (draft.why || '').trim();
  if (why.length < WHY_MIN || why.length > WHY_MAX) add('why', `Say why in ${WHY_MIN} to ${WHY_MAX} characters`);
  const source = (draft.source || '').trim();
  if (!source || source.length > 500) add('source', 'Name the source: a link, a document or a site visit');
  if (draft.reviewBy && !validDate(draft.reviewBy)) add('reviewBy', 'Write the date as YYYY-MM-DD');
  const strings = [id, path, who, why, source, typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value ?? '')];
  if (strings.some((s) => DASH_RE.test(s))) add('why', 'Remove the en or em dash (write "to" for a range)');
  if (existing.some((r) => r.layer === draft.layer && r.id === id && Object.hasOwn(r.patch || {}, path))) {
    add('path', 'An override already sets this field; edit that entry instead');
  }
  return out;
}

/** The entry as data/overrides/{layer}.json holds it. */
export function buildEntry(draft) {
  const entry = {
    id: draft.id.trim(),
    patch: { [draft.path.trim()]: parseValue(draft.kind, draft.value).value },
    who: draft.who.trim(),
    when: draft.when,
    why: draft.why.trim(),
    source: draft.source.trim(),
  };
  if (draft.reviewBy) entry.review_by = draft.reviewBy;
  return entry;
}

/** The whole layer file with the new entry appended, ready to download. */
export function layerFile(snapshot, layer, entry) {
  const rows = (snapshot?.overrides || []).filter((r) => r.layer === layer).map((r) => {
    const e = { id: r.id, patch: r.patch, who: r.who, when: r.when, why: r.why, source: r.source };
    if (r.review_by) e.review_by = r.review_by;
    return e;
  });
  return {
    layer,
    version: 1,
    about: snapshot?.about?.[layer] || `Hand corrections to the ${layer} layer, applied last in every pipeline run by pipeline/apply_overrides.py.`,
    overrides: [...rows, entry],
  };
}

/** The same change as an RFC 6902 JSON Patch against the layer file. */
export function jsonPatch(entry) {
  return [{ op: 'add', path: '/overrides/-', value: entry }];
}

/** Title and body for the pull request that carries the change. */
export function prText(layer, entry) {
  const [path] = Object.keys(entry.patch);
  const title = `Override: ${layer} ${entry.id} ${path}`;
  const body = [
    `Adds one hand correction to \`data/overrides/${layer}.json\` (ROADMAP I13).`,
    '',
    `- Item: \`${entry.id}\` (${LAYER_LABEL[layer] || layer})`,
    `- Field: \`${path}\` set to \`${JSON.stringify(entry.patch[path])}\``,
    `- Who: ${entry.who}`,
    `- When: ${entry.when}`,
    `- Why: ${entry.why}`,
    `- Source: ${entry.source}`,
    entry.review_by ? `- Review by: ${entry.review_by}` : null,
    '',
    'Check: `python -I pipeline/apply_overrides.py --check`, then a run applies it last',
    '(`python pipeline/apply_overrides.py --snapshot`, then `npm run data` in continent-app).',
  ].filter((l) => l !== null).join('\n');
  return { title, body };
}
