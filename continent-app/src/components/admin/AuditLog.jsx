import { useI18n } from '../../i18n/index.jsx';
import { fmtDateTime } from './format.js';

// One detail cell. A row that carries a previous and a new state (config
// keys, overrides, T064) shows them side by side, each whole, so the old
// value is never the part that gets cut off (T064-b). Anything else in the
// detail object is shown under them as one line. A row with neither is the
// plain JSON it always was.
//
// There is no revert button on purpose. The RPCs behind the trail cannot
// delete a config key that did not exist before, or empty an override note,
// so a one-click revert would restore some rows and not others. The two
// columns give the admin the old value to set by hand.
function pretty(v) {
  if (v === undefined) return '';
  try { return JSON.stringify(v, null, 1); } catch { return String(v); }
}

export function AuditDetail({ detail }) {
  const { t } = useI18n();
  if (!detail) return null;
  const hasPair = detail && typeof detail === 'object'
    && ('previous' in detail || 'new' in detail);
  if (!hasPair) return <>{JSON.stringify(detail)}</>;
  const { previous, new: next, ...rest } = detail;
  const restKeys = Object.keys(rest);
  return (
    <div className="adminpage-auditpair">
      <div>
        <span className="adminpage-auditlabel">{t('admin.auditBefore')}</span>
        <pre>{previous === undefined ? t('admin.auditNone') : pretty(previous)}</pre>
      </div>
      <div>
        <span className="adminpage-auditlabel">{t('admin.auditAfter')}</span>
        <pre>{next === undefined ? t('admin.auditNone') : pretty(next)}</pre>
      </div>
      {restKeys.length > 0 && (
        <p className="adminpage-auditrest">{JSON.stringify(rest)}</p>
      )}
    </div>
  );
}

// The admin trail: every privileged RPC writes a row, and this is where
// they are read. AuditLog is the full table on the Audit tab, RecentAudit
// is the last eight rows at the foot of the overview. Both read the one
// `audit` state that useAuditLog holds, so an action anywhere on the page
// shows up in both after its loadAudit(25).
export function AuditLog({ audit, auditBusy, loadAudit }) {
  const { t } = useI18n();
  return (
    <>
      <h1 className="adminpage-h1">{t('admin.nav.audit')}</h1>
      <p className="adminpage-muted">{t('admin.auditHint')}</p>
      {(audit?.rows || []).length === 0 ? (
        <p className="adminpage-muted">{t('admin.auditEmpty')}</p>
      ) : (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table">
            <thead>
              <tr>
                <th>{t('admin.colWhen')}</th>
                <th>{t('admin.colAction')}</th>
                <th>{t('admin.colActor')}</th>
                <th>{t('admin.colTarget')}</th>
                <th>{t('admin.colDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {(audit.rows || []).map((r) => (
                <tr key={r.id}>
                  <td className="mono">{fmtDateTime(r.createdAt)}</td>
                  <td><b>{r.action}</b></td>
                  <td className="mono">{r.actor}</td>
                  <td className="mono">{r.target || ''}</td>
                  <td className="adminpage-detailcell">
                    <AuditDetail detail={r.detail} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(audit?.rows || []).length < (audit?.total || 0) && (
        <button
          type="button"
          className="adminpage-btn"
          disabled={auditBusy}
          onClick={() => loadAudit((audit?.rows || []).length + 50)}
        >
          {auditBusy ? t('account.pleaseWait') : t('admin.loadMore')}
        </button>
      )}
    </>
  );
}

export function RecentAudit({ audit }) {
  const { t } = useI18n();
  return (
    <>
      <h2 className="adminpage-h2">{t('admin.recentTitle')}</h2>
      {(audit?.rows || []).length === 0 ? (
        <p className="adminpage-muted">{t('admin.auditEmpty')}</p>
      ) : (
        <ul className="adminpage-log">
          {(audit.rows || []).slice(0, 8).map((r) => (
            <li key={r.id}>
              <span className="adminpage-when">{fmtDateTime(r.createdAt)}</span>
              <span className="adminpage-what">
                <b>{r.action}</b>{r.target ? ` ${r.target}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
