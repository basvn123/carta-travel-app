// Link health (ROADMAP D16, T1197): the pure half of the fix-or-drop action in
// the Data health tab. A broken or moved link becomes a draft of the existing
// override flow (pipelineOverrides.js, ROADMAP I13), so the correction lands
// through git like any other. Nothing here writes anywhere.

import { LAYERS, emptyDraft, draftProblems, buildEntry } from './pipelineOverrides.js';

/** Overrides take a dotted path of field names; a list position is not one. */
export function overridePath(item) {
  const w = item?.where?.[0];
  if (!w || !LAYERS.includes(w.layer) || !w.id || !w.path) return null;
  // app_data.json paths start inside the destination; layer files inside the item.
  const path = w.path;
  if (path.split('.').some((p) => /^\d/.test(p))) return null;
  return { layer: w.layer, id: w.id, path };
}

/** The override draft for one list row, or null when it cannot be one
 *  (a link inside a list, or a partner page: edit those in the source). */
export function linkDraft(item, action, { who = '', replacement = '', today = new Date().toISOString().slice(0, 10) } = {}) {
  const target = overridePath(item);
  if (!target || (action !== 'fix' && action !== 'drop')) return null;
  const day = String(item.checked_at || today).slice(0, 10);
  const what = item.status ? `answered ${item.status}` : `did not answer (${item.err || 'no reply'})`;
  const base = {
    ...emptyDraft(today), layer: target.layer, id: target.id, path: target.path, who,
    source: item.url, when: today,
  };
  if (action === 'drop') {
    return { ...base, kind: 'JSON', value: 'null', why: `Dropped: the link ${what} on ${day} (link health check, D16).` };
  }
  const moved = item.final && item.final !== item.url ? item.final : '';
  const to = (replacement || moved).trim();
  return { ...base, kind: 'text', value: to, why: `Replaced: the old link ${what} on ${day}; the new one is ${to || 'to be filled in'} (link health check, D16).` };
}

/** { entry, problems } for a row and an action; entry is null while problems remain. */
export function linkEntry(item, action, opts, existing = []) {
  const draft = linkDraft(item, action, opts);
  if (!draft) return { entry: null, problems: [{ field: 'path', message: 'This link sits in a list or a partner page: change it in the source.' }] };
  const problems = draftProblems(draft, existing);
  return { entry: problems.length ? null : buildEntry(draft), problems, layer: draft.layer };
}
