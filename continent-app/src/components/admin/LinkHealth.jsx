import React, { useState } from 'react';
import snapshot from '../../admin/linkHealth.json';
import overrides from '../../admin/pipelineOverrides.json';
import { layerFile, LAYER_LABEL } from './pipelineOverrides.js';
import { linkEntry } from './linkFix.js';
import { Button } from '../ui/Button.jsx';

// Link and page health (ROADMAP D16, T1197): the weekly check of every
// outbound link and image URL (pipeline/audit/link_health.py). Broken links are
// listed with the item that carries them and a fix-or-drop action that drafts
// a hand correction through the I13 override flow. Owner-only and English-only,
// like DataHealth. Nothing is fetched: this is the build's snapshot.

const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const day = (s) => (s ? String(s).slice(0, 10) : 'none');

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Fixer({ item, action, who, setWho, onClose, existing }) {
  const [to, setTo] = useState(item.final && item.final !== item.url ? item.final : '');
  const r = linkEntry(item, action, { who, replacement: to }, existing);
  return (
    <div className="adminpage-card" data-linkfix={action}>
      <p className="adminpage-muted">
        {action === 'drop' ? 'Drop: set the field empty.' : 'Fix: set the field to a new address.'}
        {' '}This drafts one correction in data/overrides; it lands through a pull request.
      </p>
      <label>Your name <input value={who} onChange={(e) => setWho(e.target.value)} /></label>
      {action === 'fix' && <label>New address <input value={to} onChange={(e) => setTo(e.target.value)} /></label>}
      {r.problems.length > 0 && (
        <ul className="adminpage-keylist">{r.problems.map((p) => <li key={p.field + p.message} className="adminpage-muted">{p.message}</li>)}</ul>
      )}
      <Button data-action="download" disabled={!r.entry}
        onClick={() => download(`${r.layer}.json`, `${JSON.stringify(layerFile(overrides, r.layer, r.entry), null, 1)}\n`)}>
        Download the {LAYER_LABEL[r.layer] || r.layer} layer file
      </Button>
      {' '}<Button variant="ghost" onClick={onClose}>Close</Button>
    </div>
  );
}

export function LinkHealth({ data = snapshot, existing = overrides.overrides || [] }) {
  const [pick, setPick] = useState(null);
  const [who, setWho] = useState('');
  const t = data?.totals || {};
  if (!t.checked) {
    return (
      <section data-links="empty">
        <h2 className="adminpage-h2">Link health</h2>
        <p className="adminpage-muted">
          No link check yet. The weekly task link_health (python pipeline/audit/link_health.py run) writes one;
          the next build shows the broken links here.
        </p>
      </section>
    );
  }
  const rows = data.broken || [];
  return (
    <section data-links="card">
      <h2 className="adminpage-h2">Link health</h2>
      <p className="adminpage-muted">
        Outbound links and image URLs, checked politely (HEAD first, robots.txt respected) in the run of {day(data.generated_at)}.
        A link is broken after two failed checks in a row; timeouts and rate limits are not counted.
        The share of broken links is a D2 rule (scripts/quality/rules.yaml).
      </p>
      <div className="adminpage-tiles">
        <div className="adminpage-tile"><b>{t.links}</b><span>Links</span></div>
        <div className="adminpage-tile"><b>{t.checked}</b><span>Checked</span></div>
        <div className="adminpage-tile"><b>{t.broken}</b><span>Broken ({pct(t.broken_share)})</span></div>
        <div className="adminpage-tile"><b>{t.moved}</b><span>Moved</span></div>
      </div>
      <div className="adminpage-tablewrap" tabIndex={0}>
        <table className="adminpage-table" data-links="kinds">
          <thead><tr><th>kind</th><th>links</th><th>checked</th><th>ok</th><th>moved</th><th>unsure</th><th>robots</th><th>broken</th></tr></thead>
          <tbody>
            {Object.entries(data.kinds || {}).map(([k, v]) => (
              <tr key={k} data-kind={k}>
                <td className="mono">{k}</td><td className="mono">{v.links}</td><td className="mono">{v.checked}</td>
                <td className="mono">{v.ok}</td><td className="mono">{v.moved}</td><td className="mono">{v.unsure}</td>
                <td className="mono">{v.robots}</td><td className="mono">{v.broken}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="adminpage-h2">Broken links ({data.broken_total ?? rows.length}{rows.length < (data.broken_total ?? 0) ? `, first ${rows.length}` : ''})</h3>
      {rows.length === 0 ? <p className="adminpage-muted">None.</p> : (
        <div className="adminpage-tablewrap" tabIndex={0}>
          <table className="adminpage-table" data-links="broken">
            <thead><tr><th>link</th><th>answer</th><th>used by</th><th>action</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const w = r.where?.[0];
                return (
                  <tr key={r.url} data-url={r.url}>
                    <td className="mono"><a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a></td>
                    <td className="mono">{r.status ?? r.err ?? 'none'}</td>
                    <td className="mono">{w ? `${w.layer} ${w.id || w.file} ${w.path}` : ''}{r.uses > 1 ? ` (+${r.uses - 1} more)` : ''}</td>
                    <td>
                      <Button size="sm" data-action="fix" onClick={() => setPick({ url: r.url, action: 'fix' })}>Fix</Button>{' '}
                      <Button size="sm" data-action="drop" onClick={() => setPick({ url: r.url, action: 'drop' })}>Drop</Button>
                      {pick?.url === r.url && (
                        <Fixer key={pick.action} item={r} action={pick.action} who={who} setWho={setWho}
                          existing={existing} onClose={() => setPick(null)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
