import React, { useMemo, useState } from 'react';
import snapshot from '../../admin/pipelineOverrides.json';
import { Button } from '../ui/Button.jsx';
import {
  LAYERS, LAYER_LABEL, FIELD_HINTS, VALUE_KINDS, emptyDraft, draftProblems,
  buildEntry, layerFile, jsonPatch, prText,
} from './pipelineOverrides.js';

// Overrides (ROADMAP I13, T1173): the hand corrections in data/overrides/,
// which pipeline/apply_overrides.py writes over the pipeline's output last in
// every run. The list is the snapshot that step writes (the next build
// carries it); the draft form only produces text: the updated layer file to
// download, the same change as a JSON Patch, and the pull request text. No
// database is written. The live, no-deploy corrections stay in the Content
// tab (content_overrides, migrations 018 and 043).
//
// English only and owner only, like DataHealth and PriceProvenance.

const STATUS_TEXT = {
  applied: 'Applied in the last run',
  unchanged: 'Already in the output',
  orphan: 'Item no longer in the output',
  bad_path: 'Field path not in the record',
  no_output: 'Layer output missing',
  'not run': 'Not applied yet',
};
const STATUS_CLASS = { orphan: 'adminpage-err', bad_path: 'adminpage-err', no_output: 'adminpage-err' };

const day = (s) => (s ? String(s).slice(0, 10) : 'never');
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Field({ id, label, problem, children, hint }) {
  return (
    <div className="adminpage-ovfield">
      <label className="adminpage-lock-label" htmlFor={id}>{label}</label>
      {children}
      {hint && !problem && <span className="adminpage-muted adminpage-fine">{hint}</span>}
      {problem && <span className="adminpage-err" id={`${id}-err`} data-problem={id}>{problem}</span>}
    </div>
  );
}

function OverrideList({ rows, layer }) {
  const shown = layer === 'all' ? rows : rows.filter((r) => r.layer === layer);
  if (!shown.length) {
    return (
      <p className="adminpage-muted" data-overrides="empty">
        No overrides {layer === 'all' ? 'yet' : `for ${LAYER_LABEL[layer].toLowerCase()}`}. Draft the first one below;
        it reaches travellers after its pull request is merged and the next pipeline run applies it.
      </p>
    );
  }
  return (
    <div className="adminpage-tablewrap" tabIndex={0}>
      <table className="adminpage-table adminpage-table-static" data-overrides="list">
        <thead>
          <tr><th>Item</th><th>Change</th><th>Why and source</th><th>Who, when</th><th>Last run</th></tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={`${r.layer}/${r.id}`} data-override={`${r.layer}/${r.id}`}>
              <td><span className="adminpage-muted">{LAYER_LABEL[r.layer]}</span><br /><code>{r.id}</code></td>
              <td>
                {Object.entries(r.patch || {}).map(([k, v]) => (
                  <div key={k}><code>{k}</code>: {show(v)}</div>
                ))}
              </td>
              <td>
                {r.why}
                <br />
                <span className="adminpage-muted adminpage-fine">
                  {/^https:\/\//.test(r.source)
                    ? <a href={r.source} target="_blank" rel="noopener noreferrer">{r.source}</a>
                    : r.source}
                </span>
              </td>
              <td>{r.who}<br /><span className="adminpage-muted adminpage-fine">{r.when}{r.review_by ? `, review by ${r.review_by}` : ''}</span></td>
              <td className={STATUS_CLASS[r.status] || 'adminpage-muted'} data-status={r.status}>
                {STATUS_TEXT[r.status] || r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PipelineOverrides({ data = snapshot, initialDraft }) {
  const rows = useMemo(() => data?.overrides || [], [data]);
  const counts = data?.counts || {};
  const [layer, setLayer] = useState('all');
  const [draft, setDraft] = useState(() => initialDraft || emptyDraft());
  const [tried, setTried] = useState(Boolean(initialDraft));
  const [copied, setCopied] = useState('');
  const problems = useMemo(() => draftProblems(draft, rows), [draft, rows]);
  const problemOf = (f) => (tried ? problems.find((p) => p.field === f)?.message : undefined);
  const ready = problems.length === 0;
  const entry = ready ? buildEntry(draft) : null;
  const file = entry ? layerFile(data, draft.layer, entry) : null;
  const pr = entry ? prText(draft.layer, entry) : null;
  const set = (k) => (e) => { setDraft((d) => ({ ...d, [k]: e.target.value })); setCopied(''); };
  const errProps = (f) => (problemOf(f) ? { 'aria-invalid': true, 'aria-describedby': `ov2-${f}-err` } : {});

  const copy = async (what, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(''); }
  };

  const orphans = rows.filter((r) => STATUS_CLASS[r.status]).length;

  return (
    <section data-overrides="panel">
      <h1 className="adminpage-h1">Overrides</h1>
      <p className="adminpage-muted">
        Hand corrections in <code>data/overrides/</code>, written over the pipeline&apos;s output last in every run,
        so a rerun keeps them. Each one says who, when, why and from which source. Last applied: {day(data?.generated_at)}.
        For a fix that must show today without a pull request, use the Content tab.
      </p>

      <div className="adminpage-tiles">
        {LAYERS.map((l) => (
          <div key={l} className="adminpage-tile" data-count={l}><b>{counts[l] ?? 0}</b><span>{LAYER_LABEL[l]}</span></div>
        ))}
        <div className="adminpage-tile"><b>{orphans}</b><span>Need a look</span></div>
      </div>

      <label className="adminpage-inline" htmlFor="ov2-show">
        <span className="adminpage-lock-label">Show</span>
        <select id="ov2-show" className="adminpage-lock-input" value={layer} onChange={(e) => setLayer(e.target.value)}>
          {['all', ...LAYERS].map((l) => <option key={l} value={l}>{l === 'all' ? 'All layers' : LAYER_LABEL[l]}</option>)}
        </select>
      </label>

      <OverrideList rows={rows} layer={layer} />

      <h2 className="adminpage-h2">Draft an override</h2>
      <p className="adminpage-muted">
        One field per override. The draft is checked by the same rules as the pipeline step. Nothing is saved here:
        download the layer file or copy the pull request text.
      </p>

      <form className="adminpage-ovform" data-overrides="draft" noValidate
        onSubmit={(e) => { e.preventDefault(); setTried(true); }}>
        <Field id="ov2-layer" label="Layer">
          <select id="ov2-layer" className="adminpage-lock-input" value={draft.layer} onChange={set('layer')}>
            {LAYERS.map((l) => <option key={l} value={l}>{LAYER_LABEL[l]}</option>)}
          </select>
        </Field>
        <Field id="ov2-id" label="Item id" problem={problemOf('id')} hint="The id in the wire, for example hallstatt">
          <input id="ov2-id" className="adminpage-lock-input mono" value={draft.id} onChange={set('id')} autoComplete="off" {...errProps('id')} />
        </Field>
        <Field id="ov2-path" label="Field" problem={problemOf('path')} hint={`Often: ${FIELD_HINTS[draft.layer].join(', ')}`}>
          <input id="ov2-path" className="adminpage-lock-input mono" value={draft.path} onChange={set('path')}
            list="ov2-path-hints" autoComplete="off" {...errProps('path')} />
          <datalist id="ov2-path-hints">
            {FIELD_HINTS[draft.layer].map((f) => <option key={f} value={f} />)}
          </datalist>
        </Field>
        <Field id="ov2-kind" label="Value type">
          <select id="ov2-kind" className="adminpage-lock-input" value={draft.kind} onChange={set('kind')}>
            {VALUE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field id="ov2-value" label="New value" problem={problemOf('value')}>
          <textarea id="ov2-value" className="adminpage-lock-input adminpage-textarea" rows={2} value={draft.value} onChange={set('value')} {...errProps('value')} />
        </Field>
        <Field id="ov2-who" label="Who" problem={problemOf('who')}>
          <input id="ov2-who" className="adminpage-lock-input" value={draft.who} onChange={set('who')} autoComplete="off" {...errProps('who')} />
        </Field>
        <Field id="ov2-when" label="When" problem={problemOf('when')}>
          <input id="ov2-when" type="date" className="adminpage-lock-input" value={draft.when} onChange={set('when')} {...errProps('when')} />
        </Field>
        <Field id="ov2-reviewBy" label="Review by (optional)" problem={problemOf('reviewBy')}>
          <input id="ov2-reviewBy" type="date" className="adminpage-lock-input" value={draft.reviewBy} onChange={set('reviewBy')} {...errProps('reviewBy')} />
        </Field>
        <Field id="ov2-why" label="Why" problem={problemOf('why')} hint="What was wrong, in plain words">
          <textarea id="ov2-why" className="adminpage-lock-input adminpage-textarea" rows={2} value={draft.why} onChange={set('why')} {...errProps('why')} />
        </Field>
        <Field id="ov2-source" label="Source" problem={problemOf('source')} hint="A link, a document or a site visit with its date">
          <input id="ov2-source" className="adminpage-lock-input" value={draft.source} onChange={set('source')} autoComplete="off" {...errProps('source')} />
        </Field>
        <div className="adminpage-row adminpage-editoractions">
          <Button type="submit" variant="primary">Check draft</Button>
          <span className="adminpage-muted" aria-live="polite" data-draft={ready ? 'ready' : 'incomplete'}>
            {ready ? 'Ready: the pipeline accepts this entry' : tried ? `${problems.length} to fix` : ''}
          </span>
        </div>
      </form>

      {tried && ready && (
        <div className="adminpage-ovout" data-overrides="output">
          <h3 className="adminpage-h3">The entry</h3>
          <pre className="adminpage-ovpre" data-out="entry">{JSON.stringify(entry, null, 1)}</pre>
          <div className="adminpage-row">
            <Button data-action="download"
              onClick={() => download(`${draft.layer}.json`, `${JSON.stringify(file, null, 1)}\n`)}>
              Download {draft.layer}.json
            </Button>
            <Button data-action="download-patch"
              onClick={() => download(`${draft.layer}.patch.json`, `${JSON.stringify(jsonPatch(entry), null, 1)}\n`)}>
              Download JSON Patch
            </Button>
          </div>
          <p className="adminpage-muted adminpage-fine">
            Replace <code>data/overrides/{draft.layer}.json</code> with the download, or apply the JSON Patch to it.
          </p>
          <h3 className="adminpage-h3">Pull request</h3>
          <pre className="adminpage-ovpre" data-out="pr">{`${pr.title}\n\n${pr.body}`}</pre>
          <div className="adminpage-row">
            <Button onClick={() => copy('pr', `${pr.title}\n\n${pr.body}`)}>
              Copy pull request text
            </Button>
            <span className="adminpage-muted" aria-live="polite">{copied === 'pr' ? 'Copied' : ''}</span>
          </div>
        </div>
      )}
    </section>
  );
}
