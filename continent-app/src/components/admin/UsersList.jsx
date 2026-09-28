import { useI18n } from '../../i18n/index.jsx';
import { AlertIcon, DownloadIcon, SearchIcon } from '../Icons.jsx';
import { fmtDate, fmtDateTime, initial, rowName } from './format.js';

// The Users tab: who are they. Pure render over useUsersList; a row opens
// the account through the shell's openUser.
export function UsersList({ list, openUser }) {
  const { t } = useI18n();
  const {
    search, setSearch, rows, total, degraded, listBusy, listErr, csvBusy,
    setReloadKey, loadMore, exportCsv,
  } = list;
  return (
    <>
      <div className="adminpage-headrow">
        <h1 className="adminpage-h1">{t('admin.nav.users')}</h1>
        <button type="button" className="adminpage-btn" disabled={csvBusy} onClick={exportCsv}>
          <DownloadIcon size={13} /> {csvBusy ? t('account.pleaseWait') : t('admin.exportCsv')}
        </button>
      </div>

      <div className="adminpage-search">
        <SearchIcon size={16} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.searchPlaceholder')}
          aria-label={t('admin.searchLabel')}
        />
      </div>

      {degraded && (
        <div className="adminpage-warn" role="status">
          <AlertIcon size={15} />
          <span>{t('admin.degraded')}</span>
        </div>
      )}
      {listErr && (
        <p className="adminpage-err">
          {listErr}
          <button
            type="button"
            className="adminpage-retry"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t('admin.retry')}
          </button>
        </p>
      )}

      {/* Three states, told apart on purpose: rows, a genuinely
          empty search, and a failure. A failure draws no table at
          all, because a header row over nothing reads as "your
          database is empty" when it means "the query did not
          run". */}
      {rows.length === 0 ? (
        (!listBusy && !listErr) && <p className="adminpage-muted">{t('admin.none')}</p>
      ) : (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table">
            <thead>
              <tr>
                <th>{t('admin.colUser')}</th>
                <th>{t('admin.colEmail')}</th>
                <th>{t('admin.colPlan')}</th>
                <th>{t('admin.colJoined')}</th>
                <th>{t('admin.colSeen')}</th>
                <th className="num">{t('admin.colTrips')}</th>
                <th>{t('admin.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => openUser(r.id)}>
                  <td>
                    <button
                      type="button"
                      className="adminpage-namebtn"
                      onClick={(e) => { e.stopPropagation(); openUser(r.id); }}
                    >
                      <span className="adminpage-ava" aria-hidden="true">
                        {r.avatarEmoji || initial(r)}
                      </span>
                      <span className="adminpage-nametext">
                        <b>{rowName(r)}</b>
                        {r.handle && <span>@{r.handle}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="mono">{r.email}</td>
                  <td>
                    {r.tier === 'free'
                      ? <span className="adminpage-muted">free</span>
                      : <span className={`adminpage-chip ${r.tier}`}>{r.tier}</span>}
                  </td>
                  <td className="mono">{fmtDate(r.createdAt)}</td>
                  <td className="mono">{fmtDateTime(r.lastSignIn) || t('admin.never')}</td>
                  <td className="mono num">{r.tripPlans}</td>
                  <td>
                    {r.isAdmin && <span className="adminpage-chip staff">{t('admin.chipStaff')}</span>}
                    {!!r.bannedUntil && <span className="adminpage-chip banned">{t('admin.chipBanned')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="adminpage-count">{t('admin.showing', { shown: rows.length, total })}</p>
      )}
      {rows.length < total && (
        <button type="button" className="adminpage-btn" onClick={loadMore}>
          {t('admin.loadMore')}
        </button>
      )}
    </>
  );
}
