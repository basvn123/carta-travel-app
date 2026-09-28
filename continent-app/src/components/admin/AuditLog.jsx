import { useI18n } from '../../i18n/index.jsx';
import { fmtDateTime } from './format.js';

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
                    {r.detail ? JSON.stringify(r.detail) : ''}
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
